/**
 * CMS 发布服务：WordPress REST API 推送已完成文章。
 *
 * 边界：
 * - 不负责：HTML 打包存储（ExportService）
 * - 默认发布为 draft，需人工在 WP 后台确认
 *
 * 入口：
 * - CmsPublishService
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { canPublishArticle } from '../content-review/ymyl-detect.util';
import { parseWordPressCmsConfig, type WordPressPostStatus } from '../site/site-cms.util';
import { markdownToHtml } from '../../providers/semrush/semrush-content';
import type { PublishArticleJobDto } from './dto/publish-article-job.dto';

interface WordPressPostResponse {
  id?: number;
  link?: string;
  status?: string;
}

@Injectable()
export class CmsPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async publishJob(
    organizationId: string,
    projectId: string,
    jobId: string,
    traceId: string,
    dto: PublishArticleJobDto = {},
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      include: {
        site: {
          select: {
            id: true,
            domain: true,
            cmsType: true,
            cmsConfig: true,
          },
        },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.status !== JobStatus.COMPLETED) {
      throw new BusinessException(ErrorCodes.JOB_NOT_PUBLISHABLE, '仅已完成任务可发布到 CMS');
    }

    if (!canPublishArticle(job.seoCheckData)) {
      throw new BusinessException(
        ErrorCodes.JOB_NOT_PUBLISHABLE,
        '文章未通过 YMYL 审核，暂不可发布',
      );
    }

    const wpConfig = parseWordPressCmsConfig(job.site.cmsType, job.site.cmsConfig);
    if (!wpConfig) {
      throw new BusinessException(
        ErrorCodes.CMS_NOT_CONFIGURED,
        '请先在站点设置中配置 WordPress REST API',
      );
    }

    const draftData = job.draftData as {
      title?: string;
      metaDescription?: string;
      content?: string;
    } | null;
    const briefData = job.briefData as { title?: string } | null;
    const contentMarkdown = draftData?.content?.trim() ?? '';

    if (!contentMarkdown) {
      throw new BusinessException(ErrorCodes.JOB_NOT_PUBLISHABLE, '正文为空，无法发布');
    }

    const title = draftData?.title ?? briefData?.title ?? job.targetKeyword;
    const contentHtml = markdownToHtml(contentMarkdown);
    const status: WordPressPostStatus = dto.status ?? wpConfig.defaultStatus ?? 'draft';

    const endpoint = `${wpConfig.baseUrl}/wp-json/wp/v2/posts`;
    const auth = Buffer.from(`${wpConfig.username}:${wpConfig.applicationPassword}`).toString(
      'base64',
    );

    let response: Response;
    try {
      response = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            content: contentHtml,
            status,
            excerpt: draftData?.metaDescription ?? undefined,
          }),
        },
        { label: 'WordPress REST API' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WordPress 请求失败';
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, message);
    }

    const bodyText = await response.text();
    let payload: WordPressPostResponse = {};

    try {
      payload = bodyText ? (JSON.parse(bodyText) as WordPressPostResponse) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `WordPress 发布失败：HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
      );
    }

    const publishedAt = new Date().toISOString();
    const cmsPublish = {
      provider: 'wordpress' as const,
      postId: payload.id ?? null,
      postUrl: payload.link ?? null,
      status: payload.status ?? status,
      publishedAt,
      wpStatusRequested: status,
    };

    const seoCheckData = {
      ...((job.seoCheckData ?? {}) as Record<string, unknown>),
      cmsPublish,
    };

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { seoCheckData: seoCheckData as object },
    });

    this.logger.info('Article published to WordPress', {
      traceId,
      jobId,
      postId: cmsPublish.postId,
      postUrl: cmsPublish.postUrl,
      status: cmsPublish.status,
    });

    return cmsPublish;
  }
}
