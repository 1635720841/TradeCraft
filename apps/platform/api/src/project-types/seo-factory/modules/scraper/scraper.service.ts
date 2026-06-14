/**
 * SERP 抓取服务：M1-M3，对接 ISerpProvider 并写入任务上下文。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowService）、LLM 调用
 *
 * 入口：
 * - ScraperService
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  filterSerpOrganicForSeoArticles,
  resolveSerpLocale,
  type SerpOrganicItem,
} from '@wm/shared-core';
import { SERP_PROVIDER, type ISerpProvider } from '@wm/provider-interfaces';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  DEFAULT_SERP_ARTICLE_LIMIT,
  MAX_SERP_ARTICLE_LIMIT,
} from '../../constants/serp-filter';

export interface ScrapeJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  targetKeyword: string;
  targetMarket: string;
  contentLanguage?: string;
  serpArticleLimit?: number;
  serpArticlesOnly?: boolean;
}

@Injectable()
export class ScraperService {
  constructor(
    @Inject(SERP_PROVIDER) private readonly serpProvider: ISerpProvider,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async researchSerp(ctx: ScrapeJobContext): Promise<void> {
    const locale = resolveSerpLocale(ctx.contentLanguage);

    const serpResult = await this.serpProvider.fetchSerp({
      keyword: ctx.targetKeyword,
      locale,
      country: ctx.targetMarket,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
    });

    const limit = Math.min(
      Math.max(ctx.serpArticleLimit ?? DEFAULT_SERP_ARTICLE_LIMIT, 1),
      MAX_SERP_ARTICLE_LIMIT,
    );
    const articlesOnly = ctx.serpArticlesOnly !== false;
    const { filtered, meta } = filterSerpOrganicForSeoArticles(
      (serpResult.organic ?? []) as SerpOrganicItem[],
      { limit, articlesOnly },
    );

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        serpData: {
          organic: filtered,
          organicRaw: serpResult.organic,
          filterMeta: meta,
          aiOverview: serpResult.aiOverview,
          fingerprint: serpResult.fingerprint,
        } as object,
      },
    });

    this.logger.info('SERP research completed', {
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      jobId: ctx.jobId,
      action: 'scraper.research_serp',
      serpKept: meta.kept,
      serpExcluded: meta.excluded,
      serpArticlesOnly: articlesOnly,
      serpLimit: limit,
    });
  }
}
