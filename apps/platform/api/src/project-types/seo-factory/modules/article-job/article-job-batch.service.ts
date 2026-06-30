/**
 * 文章任务批量创建与批量操作。
 *
 * 边界：
 * - 不负责：单条创建/重试/删除逻辑（ArticleJobService）
 *
 * 入口：
 * - ArticleJobBatchService
 */

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { isSeoArticleUrl, keywordFromArticleUrl } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  DEFAULT_BATCH_JOB_LIMIT,
  MAX_BATCH_JOB_LIMIT,
} from '../../constants/serp-filter';
import { MAX_BATCH_ACTION_LIMIT } from '../../constants/batch-actions';
import { BillingService } from '../../../../modules/billing/billing.service';
import { SiteArticleCrawlerService } from '../site/site-article-crawler.service';
import type { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import { ArticleJobService } from './article-job.service';

@Injectable()
export class ArticleJobBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly billingService: BillingService,
    private readonly siteArticleCrawler: SiteArticleCrawlerService,
    @Inject(forwardRef(() => ArticleJobService))
    private readonly articleJobService: ArticleJobService,
  ) {}

  async createBatch(organizationId: string, projectId: string, dto: CreateBatchArticleJobsDto) {
    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, projectId },
      select: { id: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const limit = Math.min(Math.max(dto.limit ?? DEFAULT_BATCH_JOB_LIMIT, 1), MAX_BATCH_JOB_LIMIT);
    const seoArticlesOnly = dto.seoArticlesOnly !== false;
    const scraperOptions = this.articleJobService.buildScraperOptions(dto) ?? {};
    const keywords = await this.resolveBatchKeywords(
      organizationId,
      projectId,
      dto,
      limit,
      seoArticlesOnly,
    );

    if (keywords.length === 0) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        seoArticlesOnly
          ? '未找到可运行的 SEO 文章，请检查站点 sitemap 或关键词列表'
          : '未找到可运行的关键词',
      );
    }

    await this.billingService.assertArticleQuota(organizationId, keywords.length);

    const jobs = [];
    for (const targetKeyword of keywords) {
      jobs.push(
        await this.articleJobService.create(organizationId, projectId, {
          siteId: dto.siteId,
          targetKeyword,
          contentLanguage: dto.contentLanguage,
          serpArticleLimit: scraperOptions.serpArticleLimit,
          serpArticlesOnly: scraperOptions.serpArticlesOnly,
          serpCountry: dto.serpCountry ?? scraperOptions.serpCountry,
        }),
      );
    }

    this.logger.info('Batch article jobs created', {
      organizationId,
      projectId,
      action: 'article_job.create_batch',
      source: dto.source,
      requestedLimit: limit,
      created: jobs.length,
      seoArticlesOnly,
    });

    return {
      created: jobs.length,
      skipped: Math.max(0, limit - jobs.length),
      jobs,
    };
  }

  async batchRetry(organizationId: string, projectId: string, jobIds: string[]) {
    if (jobIds.length > MAX_BATCH_ACTION_LIMIT) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `单次最多续跑 ${MAX_BATCH_ACTION_LIMIT} 个任务`,
      );
    }

    const results: Array<{
      jobId: string;
      ok: boolean;
      data?: { id: string; traceId: string; status: string; targetKeyword: string };
      error?: string;
    }> = [];

    for (const jobId of jobIds) {
      try {
        const data = await this.articleJobService.retry(organizationId, projectId, jobId);
        results.push({ jobId, ok: true, data });
      } catch (error) {
        const message =
          error instanceof BusinessException
            ? error.message
            : error instanceof Error
              ? error.message
              : '续跑失败';
        results.push({ jobId, ok: false, error: message });
      }
    }

    return {
      retried: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }

  async batchRemove(organizationId: string, projectId: string, jobIds: string[], traceId: string) {
    if (jobIds.length > MAX_BATCH_ACTION_LIMIT) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `单次最多删除 ${MAX_BATCH_ACTION_LIMIT} 个任务`,
      );
    }

    const results: Array<{
      jobId: string;
      ok: boolean;
      data?: { id: string; targetKeyword: string; deleted: true };
      error?: string;
    }> = [];

    for (const jobId of jobIds) {
      try {
        const data = await this.articleJobService.remove(organizationId, projectId, jobId, traceId);
        results.push({ jobId, ok: true, data });
      } catch (error) {
        results.push({
          jobId,
          ok: false,
          error: this.articleJobService.resolveErrorMessage(error, '删除失败'),
        });
      }
    }

    return {
      deleted: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }

  private async resolveBatchKeywords(
    organizationId: string,
    projectId: string,
    dto: CreateBatchArticleJobsDto,
    limit: number,
    seoArticlesOnly: boolean,
  ): Promise<string[]> {
    if (dto.source === 'site-crawl') {
      const discovered = await this.siteArticleCrawler.discoverForSite(
        organizationId,
        projectId,
        dto.siteId,
        {
          limit: limit * 3,
          seoArticlesOnly,
        },
      );
      return [...new Set(discovered.map((item) => item.keyword))].slice(0, limit);
    }

    const rawItems = (dto.keywords ?? []).map((item) => item.trim()).filter(Boolean);
    const normalized = rawItems
      .map((item) => {
        if (/^https?:\/\//i.test(item)) {
          if (seoArticlesOnly && !isSeoArticleUrl(item)) {
            return null;
          }
          return keywordFromArticleUrl(item);
        }
        return item;
      })
      .filter((item): item is string => Boolean(item && item.length >= 2));

    return [...new Set(normalized)].slice(0, limit);
  }
}
