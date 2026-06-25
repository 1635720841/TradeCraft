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
  filterUsableCompetitorSamples,
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
  MIN_SERP_ARTICLE_CANDIDATES,
} from '../../constants/serp-filter';
import { CompetitorPageScraper } from './competitor-page.scraper';

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
  organicFetchNum?: number;
  minArticleCandidates?: number;
  cacheTtlSeconds?: number;
  bypassCache?: boolean;
}

@Injectable()
export class ScraperService {
  constructor(
    @Inject(SERP_PROVIDER) private readonly serpProvider: ISerpProvider,
    private readonly competitorPageScraper: CompetitorPageScraper,
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
      num: ctx.organicFetchNum,
      cacheTtlSeconds: ctx.cacheTtlSeconds,
      bypassCache: ctx.bypassCache,
    });

    const limit = Math.min(
      Math.max(ctx.serpArticleLimit ?? DEFAULT_SERP_ARTICLE_LIMIT, 1),
      MAX_SERP_ARTICLE_LIMIT,
    );
    const articlesOnly = ctx.serpArticlesOnly !== false;
    const minArticleCandidates = Math.max(ctx.minArticleCandidates ?? MIN_SERP_ARTICLE_CANDIDATES, 1);
    // Fetch a wider candidate pool so failed pages can be discarded without
    // unnecessarily shrinking the requested number of valid samples.
    const candidateLimit = Math.min(limit * 2, MAX_SERP_ARTICLE_LIMIT);
    const { filtered, meta: preScrapeMeta } = filterSerpOrganicForSeoArticles(
      (serpResult.organic ?? []) as SerpOrganicItem[],
      {
        limit: candidateLimit,
        articlesOnly,
        minArticleCandidates,
      },
    );

    const { items: enrichedOrganic, scrapeMeta } = await this.competitorPageScraper.enrichOrganicItems(
      filtered,
      { traceId: ctx.traceId, jobId: ctx.jobId },
    );
    const usableOrganic = scrapeMeta.skipped
      ? enrichedOrganic
      : filterUsableCompetitorSamples(enrichedOrganic);
    const organic = usableOrganic.slice(0, limit);
    const scrapeFailedExcluded = scrapeMeta.skipped
      ? 0
      : enrichedOrganic.length - usableOrganic.length;
    const meta = {
      ...preScrapeMeta,
      kept: organic.length,
      excluded: preScrapeMeta.total - organic.length,
      limit,
      articleKept: articlesOnly ? organic.length : preScrapeMeta.articleKept,
      scrapeFailedExcluded,
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        serpData: {
          organic,
          organicRaw: serpResult.organic,
          filterMeta: meta,
          competitorScrapeMeta: scrapeMeta,
          aiOverview: serpResult.aiOverview,
          fingerprint: serpResult.fingerprint,
          fromCache: serpResult.fromCache === true,
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
      competitorScraped: scrapeMeta.succeeded,
      competitorScrapeFailed: scrapeMeta.failed,
      competitorScrapeFailedExcluded: scrapeFailedExcluded,
    });
  }
}
