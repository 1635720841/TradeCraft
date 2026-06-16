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
import {
  buildArticleJsonLd,
  buildFaqPageJsonLd,
  extractFaqItemsFromBriefAndDraft,
  mergeJsonLdGraph,
} from './article-json-ld.util';
import { appendUtmToUrl, buildInquiryHtmlBlock } from '../../constants/cta-utm.util';
import { parseSiteSettings } from '../../constants/site-settings';
import {
  buildExportPackageZip,
  slugifyExportBaseName,
} from './export-package.util';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import {
  buildExportHtmlDocument,
  buildExportHtmlUrl,
  buildExportStoragePrefix,
} from './export-html.util';
import {
  buildDraftImageStorageKey,
  parseDraftImageApiUrl,
} from '../article-job/draft-image.util';

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
        site: { select: { domain: true, settings: true } },
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

    const exported = this.resolveExportContent(job);
    const prefix = buildExportStoragePrefix(ctx.organizationId, ctx.projectId, ctx.jobId);
    const exportedAt = new Date().toISOString();

    const manifest = {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      title: exported.title,
      targetKeyword: job.targetKeyword,
      exportedAt,
      publishable: exported.publishable,
    };

    await this.storage.putObject(
      `${prefix}/manifest.json`,
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      'application/json',
    );

    if (!exported.publishable) {
      this.logger.info('Export manifest only (not publishable)', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'export.manifest_only',
        ymylBlocked: !canPublishArticle(job.seoCheckData),
        emptyContent: exported.content.length === 0,
      });
      return null;
    }

    const html = this.buildHtmlDocument(exported);

    await Promise.all([
      this.storage.putObject(`${prefix}/article.html`, Buffer.from(html, 'utf8'), 'text/html'),
      this.storage.putObject(
        `${prefix}/article.jsonld`,
        Buffer.from(JSON.stringify(exported.jsonLd, null, 2), 'utf8'),
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

  /** 下载 HTML：按当前稿件实时生成，避免旧缓存仍含 Markdown 表格等 */
  async getFreshExportHtml(
    organizationId: string,
    projectId: string,
    jobId: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const job = await this.loadExportJob(organizationId, projectId, jobId);

    if (!job.outputUrl) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '导出文件不存在，请先生成导出');
    }

    if (!canPublishArticle(job.seoCheckData)) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'YMYL 需人工审核，暂不可下载可发布 HTML',
      );
    }

    const exported = this.resolveExportContent(job);
    if (!exported.content) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '正文为空，无法导出');
    }

    const html = this.buildHtmlDocument(exported);
    return { body: Buffer.from(html, 'utf8'), contentType: 'text/html; charset=utf-8' };
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
    const job = await this.loadExportJob(organizationId, projectId, jobId);

    if (!job.outputUrl) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '导出文件不存在');
    }

    if (!canPublishArticle(job.seoCheckData)) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'YMYL 需人工审核，暂不可下载可发布资产包',
      );
    }

    const exported = this.resolveExportContent(job);
    const exportedAt = new Date().toISOString();
    const html = this.buildHtmlDocument(exported);

    let manifestText: string | undefined;
    try {
      const manifestFile = await this.getExportObject(organizationId, projectId, jobId, 'manifest');
      manifestText = manifestFile.body.toString('utf8');
    } catch {
      manifestText = undefined;
    }

    const draftData = job.draftData as {
      articleImages?: ArticleImageRecord[];
      content?: string;
    } | null;

    const result = await buildExportPackageZip({
      targetKeyword: job.targetKeyword,
      title: exported.title,
      metaDescription: exported.metaDescription,
      siteDomain: job.site.domain,
      exportedAt,
      html,
      jsonLdText: JSON.stringify(exported.jsonLd, null, 2),
      manifestText,
      articleImages: draftData?.articleImages,
      contentMarkdown: exported.content,
      fetchImage: (url) => this.fetchDraftImageForExport(organizationId, projectId, jobId, url),
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

  /** 多任务资产包：每个任务一个子目录，合并为单个 zip */
  async buildBatchExportPackage(
    organizationId: string,
    projectId: string,
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string; exported: number; failed: number; failures: Array<{ jobId: string; targetKeyword: string; error: string }> }> {
    const zipEntries: Record<string, Uint8Array> = {};
    const usedFolders = new Map<string, number>();
    const manifestLines: string[] = ['SEO 批量导出', `Exported at: ${new Date().toISOString()}`, ''];
    const failures: Array<{ jobId: string; targetKeyword: string; error: string }> = [];
    let exported = 0;
    let failed = 0;

    for (const jobId of jobIds) {
      const job = await this.prisma.articleJob.findFirst({
        where: { id: jobId, organizationId, projectId },
        select: { targetKeyword: true },
      });

      if (!job) {
        failed += 1;
        const error = '任务不存在';
        failures.push({ jobId, targetKeyword: jobId, error });
        manifestLines.push(`[FAIL] ${jobId}: ${error}`);
        continue;
      }

      try {
        const pack = await this.buildExportPackage(organizationId, projectId, jobId);
        const baseSlug = slugifyExportBaseName(job.targetKeyword);
        const seen = usedFolders.get(baseSlug) ?? 0;
        usedFolders.set(baseSlug, seen + 1);
        const folder = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;

        const inner = unzipSync(new Uint8Array(pack.buffer));
        for (const [path, data] of Object.entries(inner)) {
          zipEntries[`${folder}/${path}`] = data;
        }

        exported += 1;
        manifestLines.push(`[OK] ${job.targetKeyword} → ${folder}/`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : '导出失败';
        failures.push({ jobId, targetKeyword: job.targetKeyword, error: message });
        manifestLines.push(`[FAIL] ${job.targetKeyword}: ${message}`);
      }
    }

    if (exported === 0) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        failed > 0 ? '所选任务均无法导出（未完成、未过 YMYL 或正文为空）' : '没有可导出的任务',
      );
    }

    manifestLines.push('', `成功: ${exported}`, `失败: ${failed}`);
    zipEntries['export-manifest.txt'] = strToU8(`${manifestLines.join('\n')}\n`);

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `batch-export-${stamp}.zip`;
    const buffer = Buffer.from(zipSync(zipEntries));

    this.logger.info('Batch export package built', {
      organizationId,
      projectId,
      action: 'export.batch_built',
      exported,
      failed,
      fileName,
    });

    return { buffer, fileName, exported, failed, failures };
  }

  private async fetchDraftImageForExport(
    organizationId: string,
    projectId: string,
    jobId: string,
    url: string,
  ): Promise<{ body: Buffer; contentType?: string } | null> {
    const parsed = parseDraftImageApiUrl(url);
    if (!parsed || parsed.projectId !== projectId || parsed.jobId !== jobId) {
      return null;
    }

    const key = buildDraftImageStorageKey(
      organizationId,
      projectId,
      jobId,
      parsed.filename,
    );
    const stored = await this.storage.getObject(key);
    if (!stored) return null;

    return {
      body: stored.body,
      contentType: stored.contentType,
    };
  }

  private async loadExportJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      include: { site: { select: { domain: true } } },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    return job;
  }

  private resolveExportContent(job: {
    targetKeyword: string;
    briefData: unknown;
    draftData: unknown;
    seoCheckData: unknown;
    site: { domain: string; settings?: unknown };
  }) {
    const briefData = job.briefData as {
      title?: string;
      metaDescription?: string;
      outline?: Record<string, unknown>;
    } | null;
    const draftData = job.draftData as {
      title?: string;
      metaDescription?: string;
      content?: string;
    } | null;

    const title = draftData?.title ?? briefData?.title ?? job.targetKeyword;
    const metaDescription = draftData?.metaDescription ?? briefData?.metaDescription;
    const content = draftData?.content?.trim() ?? '';
    const publishable = canPublishArticle(job.seoCheckData) && content.length > 0;
    const publishedAt = new Date().toISOString();

    const articleJsonLd = buildArticleJsonLd({
      title,
      description: metaDescription,
      content,
      siteDomain: job.site.domain,
      targetKeyword: job.targetKeyword,
      publishedAt,
    });

    const faqItems = extractFaqItemsFromBriefAndDraft(job.briefData, content);
    const faqJsonLd = buildFaqPageJsonLd(faqItems);
    const jsonLd = mergeJsonLdGraph(articleJsonLd, faqJsonLd);

    const profile = parseSiteSettings(job.site.settings).contentProfile;
    const suffixHtml = this.buildExportSuffixHtml(profile, job.targetKeyword);

    return { title, metaDescription, content, publishable, jsonLd, suffixHtml };
  }

  private buildExportSuffixHtml(
    profile: ReturnType<typeof parseSiteSettings>['contentProfile'],
    targetKeyword: string,
  ): string | undefined {
    const ctaText = profile?.ctaPrimaryText?.trim();
    const ctaUrl = profile?.ctaPrimaryUrl?.trim();
    if (!ctaText || !ctaUrl) return undefined;

    const withUtm = appendUtmToUrl(
      ctaUrl,
      {
        utmSource: profile?.utmSource,
        utmMedium: profile?.utmMedium,
        utmCampaign: profile?.utmCampaign,
        utmContent: profile?.utmContent,
      },
      targetKeyword,
    );

    const block = buildInquiryHtmlBlock(ctaText, withUtm);
    return block.trim() ? block : undefined;
  }

  private buildHtmlDocument(exported: ReturnType<ExportService['resolveExportContent']>) {
    return buildExportHtmlDocument({
      title: exported.title,
      metaDescription: exported.metaDescription,
      contentMarkdown: exported.content,
      jsonLd: exported.jsonLd,
      suffixHtml: exported.suffixHtml,
    });
  }
}
