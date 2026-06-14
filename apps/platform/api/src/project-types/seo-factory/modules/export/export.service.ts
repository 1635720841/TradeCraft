/**
 * M10 文章导出：HTML + JSON-LD 打包并写入对象存储。
 *
 * 边界：
 * - 不负责：计费（article.completed 事件）
 * - 不负责：YMYL 审核逻辑（复用 canPublishArticle）
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { StorageService } from '../../../../core/storage/storage.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { canPublishArticle } from '../content-review/ymyl-detect.util';
import type { ArticleImageRecord } from '../illustration/article-image.util';
import { buildArticleJsonLd } from './article-json-ld.util';
import {
  buildExportPackageZip,
  slugifyExportBaseName,
} from './export-package.util';
import {
  buildExportHtmlDocument,
  buildExportHtmlUrl,
  buildExportStoragePrefix,
} from './export-html.util';

export interface ExportJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
  ) {}

  /** 工作流完成前调用：生成导出物并返回可发布 HTML 的 API 路径（YMYL 需人工审核时为 null） */
  async exportForJob(ctx: ExportJobContext): Promise<string | null> {
    const job = await this.prisma.articleJob.findFirst({
      where: {
        id: ctx.jobId,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
      },
      include: {
        site: { select: { domain: true } },
      },
    });

    if (!job) {
      this.logger.warn('Export skipped: job not found', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'export.skip_not_found',
      });
      return null;
    }

    const briefData = job.briefData as {
      title?: string;
      metaDescription?: string;
    } | null;
    const draftData = job.draftData as {
      title?: string;
      metaDescription?: string;
      content?: string;
    } | null;

    const title = draftData?.title ?? briefData?.title ?? job.targetKeyword;
    const metaDescription = draftData?.metaDescription ?? briefData?.metaDescription;
    const content = draftData?.content?.trim() ?? '';
    const prefix = buildExportStoragePrefix(ctx.organizationId, ctx.projectId, ctx.jobId);
    const exportedAt = new Date().toISOString();
    const publishable = canPublishArticle(job.seoCheckData) && content.length > 0;

    const manifest = {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      title,
      targetKeyword: job.targetKeyword,
      exportedAt,
      publishable,
    };

    await this.storage.putObject(
      `${prefix}/manifest.json`,
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      'application/json',
    );

    if (!publishable) {
      this.logger.info('Export manifest only (not publishable)', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'export.manifest_only',
        ymylBlocked: !canPublishArticle(job.seoCheckData),
        emptyContent: content.length === 0,
      });
      return null;
    }

    const jsonLd = buildArticleJsonLd({
      title,
      description: metaDescription,
      content,
      siteDomain: job.site.domain,
      targetKeyword: job.targetKeyword,
      publishedAt: exportedAt,
    });

    const html = buildExportHtmlDocument({
      title,
      metaDescription,
      contentMarkdown: content,
      jsonLd,
    });

    await Promise.all([
      this.storage.putObject(`${prefix}/article.html`, Buffer.from(html, 'utf8'), 'text/html'),
      this.storage.putObject(
        `${prefix}/article.jsonld`,
        Buffer.from(JSON.stringify(jsonLd, null, 2), 'utf8'),
        'application/ld+json',
      ),
    ]);

    const outputUrl = buildExportHtmlUrl(ctx.projectId, ctx.jobId);

    this.logger.info('Article exported', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'export.completed',
      outputUrl,
    });

    return outputUrl;
  }

  async getExportObject(
    organizationId: string,
    projectId: string,
    jobId: string,
    kind: 'html' | 'jsonld' | 'manifest',
  ): Promise<{ body: Buffer; contentType: string }> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { id: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const fileName =
      kind === 'html' ? 'article.html' : kind === 'jsonld' ? 'article.jsonld' : 'manifest.json';
    const key = `${buildExportStoragePrefix(organizationId, projectId, jobId)}/${fileName}`;
    const stored = await this.storage.getObject(key);

    if (!stored) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '导出文件不存在');
    }

    return stored;
  }

  async buildExportPackage(
    organizationId: string,
    projectId: string,
    jobId: string,
  ): Promise<{ buffer: Buffer; fileName: string; imageCount: number }> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      include: { site: { select: { domain: true } } },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (!job.outputUrl) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '导出文件不存在');
    }

    if (!canPublishArticle(job.seoCheckData)) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'YMYL 需人工审核，暂不可下载可发布资产包',
      );
    }

    const [htmlFile, jsonLdFile] = await Promise.all([
      this.getExportObject(organizationId, projectId, jobId, 'html'),
      this.getExportObject(organizationId, projectId, jobId, 'jsonld'),
    ]);

    let manifestText: string | undefined;
    try {
      const manifestFile = await this.getExportObject(organizationId, projectId, jobId, 'manifest');
      manifestText = manifestFile.body.toString('utf8');
    } catch {
      manifestText = undefined;
    }

    const briefData = job.briefData as {
      title?: string;
      metaDescription?: string;
    } | null;
    const draftData = job.draftData as {
      title?: string;
      metaDescription?: string;
      content?: string;
      articleImages?: ArticleImageRecord[];
    } | null;

    const title = draftData?.title ?? briefData?.title ?? job.targetKeyword;
    const metaDescription = draftData?.metaDescription ?? briefData?.metaDescription;
    const exportedAt = new Date().toISOString();

    const result = await buildExportPackageZip({
      targetKeyword: job.targetKeyword,
      title,
      metaDescription,
      siteDomain: job.site.domain,
      exportedAt,
      html: htmlFile.body.toString('utf8'),
      jsonLdText: jsonLdFile.body.toString('utf8'),
      manifestText,
      articleImages: draftData?.articleImages,
      contentMarkdown: draftData?.content,
    });

    this.logger.info('Export package built', {
      jobId,
      organizationId,
      projectId,
      action: 'export.package_built',
      fileName: result.fileName,
      imageCount: result.imageCount,
      baseName: slugifyExportBaseName(job.targetKeyword),
    });

    return result;
  }
}
