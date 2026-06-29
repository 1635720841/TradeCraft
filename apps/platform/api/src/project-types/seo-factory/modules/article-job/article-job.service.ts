/**
 * 文章任务服务：创建、入队与查询 ArticleJob。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowService）、外部 API（Provider）
 *
 * 入口：
 * - ArticleJobService
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { JobStatus, KeywordStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { isSeoArticleUrl, keywordFromArticleUrl, normalizeContentLanguage, evaluateReleaseReadiness } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { StorageService } from '../../../../core/storage/storage.service';
import { ARTICLE_JOB_QUEUE, PLAYWRIGHT_QUEUE } from '../../../../core/queue/queue.constants';
import { OrgQueueLimiterService } from '../../../../core/queue/org-queue-limiter.service';
import type {
  ArticleJobQueuePayload,
  ArticleJobScraperOptions,
} from '../../processors/article-job.processor';
import {
  DEFAULT_BATCH_JOB_LIMIT,
  MAX_BATCH_JOB_LIMIT,
} from '../../constants/serp-filter';
import { MAX_BATCH_ACTION_LIMIT } from '../../constants/batch-actions';
import { CALIBRATION_LAB_JOB_ID_PREFIX } from '../../utils/score-calibration-manual-samples.util';
import { isBriefApprovalPending } from '../../constants/brief-approval';
import { siteHasWritingProfile, parseSiteSettings } from '../../constants/site-settings';
import { resolveSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import { normalizeKeywordIntent, type KeywordIntentValue } from '../../constants/search-intent';
import { normalizeArticleContentForm } from '../../constants/content-form';
import { canPublishArticle } from '../content-review/ymyl-detect.util';
import { parseShopifyCmsConfig } from '../site/site-cms.util';
import type { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import type { CreateArticleJobDto } from './dto/create-article-job.dto';
import type { RefreshArticleJobSerpDto } from './dto/refresh-article-job-serp.dto';
import { resolveSerpResearchOptions } from '../../constants/serp-research-settings';
import { SiteArticleCrawlerService } from '../site/site-article-crawler.service';
import { SiteService } from '../site/site.service';
import {
  isSemrushCheckStale,
  shouldRecoverOrphanOptimizing,
  type SemrushCheckPending,
} from '../../constants/semrush-check';
import { resolveResumeStep, withWorkflowMeta } from '../../constants/workflow-resume';
import { isPendingHumanReview } from '../content-review/ymyl-detect.util';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import { BillingService } from '../../../../modules/billing/billing.service';
import { GscService } from '../gsc/gsc.service';
import { ScraperService } from '../scraper/scraper.service';
import type { DraftStaleness } from '../../constants/draft-edit';
import { hasActiveStaleness } from './draft-edit.util';
import { findKeywordConflicts } from '../keyword-pool/keyword-cannibalization.util';
import { removeBullJobsByArticleJobId } from '../../utils/article-job-queue-cleanup.util';
import type { PlaywrightJobPayload } from '../../services/semrush-queue.service';
import { buildExportStoragePrefix } from '../export/export-html.util';
import { ProjectAccessService } from '../../../../modules/project/project-access.service';
import {
  canReviewInSeoProject,
} from '../../../../modules/project/project-notification.util';

const JOB_LIST_SITE_SELECT = { domain: true, cmsType: true, cmsConfig: true } as const;

@Injectable()
export class ArticleJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly siteArticleCrawler: SiteArticleCrawlerService,
    private readonly siteService: SiteService,
    private readonly billingService: BillingService,
    private readonly gscService: GscService,
    private readonly scraperService: ScraperService,
    private readonly storage: StorageService,
    private readonly projectAccessService: ProjectAccessService,
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleJobQueue: Queue<ArticleJobQueuePayload>,
    @InjectQueue(PLAYWRIGHT_QUEUE) private readonly playwrightQueue: Queue<PlaywrightJobPayload>,
    private readonly orgQueueLimiter: OrgQueueLimiterService,
  ) {}

  private async enqueueArticleJob(
    payload: ArticleJobQueuePayload,
    bullJobId: string,
  ): Promise<void> {
    await this.orgQueueLimiter.assertCanEnqueue(payload.organizationId);
    await this.articleJobQueue.add('generate', payload, { jobId: bullJobId });
  }

  async create(organizationId: string, projectId: string, dto: CreateArticleJobDto) {
    await this.billingService.assertArticleQuota(organizationId, 1);

    const traceId = `tr_${uuidv4()}`;

    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, projectId },
      select: { id: true, contentLanguage: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const contentLanguage = normalizeContentLanguage(
      dto.contentLanguage ?? site.contentLanguage,
    );

    const searchIntent = await this.resolveSearchIntent(
      organizationId,
      projectId,
      dto.targetKeyword,
      dto.searchIntent,
    );

    const job = await this.prisma.articleJob.create({
      data: {
        traceId,
        organizationId,
        projectId,
        siteId: dto.siteId,
        targetKeyword: dto.targetKeyword,
        contentLanguage,
        searchIntent,
        contentForm: normalizeArticleContentForm(dto.contentForm),
        status: 'QUEUED',
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        createdAt: true,
      },
    });

    const scraperOptions = this.buildScraperOptions(dto);

    await this.enqueueArticleJob(
      {
        jobId: job.id,
        traceId,
        organizationId,
        projectId,
        scraperOptions,
      },
      traceId,
    );

    this.logger.info('Article job created and enqueued', {
      traceId,
      organizationId,
      projectId,
      jobId: job.id,
      action: 'article_job.create',
      scraperOptions,
    });

    const warnings = await this.buildKeywordCannibalizationWarnings(
      organizationId,
      projectId,
      dto.siteId,
      dto.targetKeyword,
      job.id,
    );

    return { ...job, warnings };
  }

  private async buildKeywordCannibalizationWarnings(
    organizationId: string,
    projectId: string,
    siteId: string,
    keyword: string,
    excludeJobId?: string,
  ) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        siteId,
        status: { not: 'FAILED' },
        ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
      },
      select: {
        id: true,
        targetKeyword: true,
        status: true,
        updatedAt: true,
        seoCheckData: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const candidates = rows
      .filter((row) => {
        if (row.status !== 'COMPLETED') return true;
        if (row.updatedAt < ninetyDaysAgo) return false;
        const postUrl = (
          (row.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish
            ?.postUrl ?? ''
        ).trim();
        return Boolean(postUrl);
      })
      .map((row) => ({
        jobId: row.id,
        keyword: row.targetKeyword,
        status: row.status,
      }));

    const conflicts = findKeywordConflicts(keyword, candidates);
    if (conflicts.length === 0) return [];

    return conflicts.map((conflict) => ({
      code: 'KEYWORD_CANNIBALIZATION' as const,
      message: `与已有任务「${conflict.keyword}」过于相似（${conflict.reason}）`,
      jobId: conflict.jobId,
      keyword: conflict.keyword,
      status: conflict.status,
      reason: conflict.reason,
    }));
  }

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
    const scraperOptions = this.buildScraperOptions(dto) ?? {};
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
        await this.create(organizationId, projectId, {
          siteId: dto.siteId,
          targetKeyword,
          contentLanguage: dto.contentLanguage,
          serpArticleLimit: scraperOptions.serpArticleLimit,
          serpArticlesOnly: scraperOptions.serpArticlesOnly,
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

  async findMany(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    options: {
      briefPending?: boolean;
      generating?: boolean;
      cmsPublishFailed?: boolean;
      cmsPublishPending?: boolean;
      staleDraft?: boolean;
      reviewPending?: boolean;
      seoNotReady?: boolean;
      assignedToMe?: boolean;
      siteOwnerMe?: boolean;
      status?: 'FAILED';
      siteId?: string;
      actorUserId?: string;
      keyword?: string;
    } = {},
  ) {
    const siteScope = await this.resolveSiteScopeFilter(
      organizationId,
      projectId,
      options.siteId,
      options.siteOwnerMe,
      options.actorUserId,
    );
    if (siteScope.empty) {
      const safeLimit = Math.min(Math.max(limit, 1), 100);
      return { items: [], total: 0, page: Math.max(page, 1), limit: safeLimit };
    }

    if (options.cmsPublishFailed) {
      return this.findManyCmsPublishFailed(
        organizationId,
        projectId,
        page,
        limit,
        siteScope,
        options.keyword,
      );
    }

    if (options.cmsPublishPending) {
      return this.findManyCmsPublishPending(
        organizationId,
        projectId,
        page,
        limit,
        siteScope,
        options.keyword,
      );
    }

    if (options.staleDraft) {
      return this.findManyStaleDraft(
        organizationId,
        projectId,
        page,
        limit,
        siteScope,
        options.keyword,
      );
    }

    if (options.seoNotReady) {
      return this.findManySeoNotReady(
        organizationId,
        projectId,
        page,
        limit,
        siteScope,
        options.keyword,
      );
    }

    if (options.reviewPending) {
      return this.findManyReviewPending(
        organizationId,
        projectId,
        page,
        limit,
        siteScope,
        options.keyword,
      );
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const andFilters: Prisma.ArticleJobWhereInput[] = [
      { NOT: { id: { startsWith: CALIBRATION_LAB_JOB_ID_PREFIX } } },
    ];

    if (options.assignedToMe && options.actorUserId) {
      andFilters.push({
        assignees: { some: { userId: options.actorUserId } },
      });
    }

    this.applyKeywordToAndFilters(andFilters, options.keyword);

    const where: Prisma.ArticleJobWhereInput = {
      organizationId,
      projectId,
      ...this.buildSiteWhere(siteScope),
    };

    if (options.status === 'FAILED') {
      where.status = JobStatus.FAILED;
    } else if (options.briefPending) {
      where.status = JobStatus.DRAFTING;
      where.briefData = {
        path: ['approvalStatus'],
        equals: 'pending',
      };
    } else if (options.generating) {
      where.status = { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] };
      andFilters.push({
        NOT: {
          AND: [
            { status: JobStatus.DRAFTING },
            {
              briefData: {
                path: ['approvalStatus'],
                equals: 'pending',
              },
            },
          ],
        },
      });
    }

    where.AND = andFilters;

    const [rows, total] = await Promise.all([
      this.prisma.articleJob.findMany({
        where,
        select: {
          id: true,
          traceId: true,
          status: true,
          targetKeyword: true,
          searchIntent: true,
          semrushScore: true,
          localSeoScore: true,
          errorMessage: true,
          seoCheckData: true,
          briefData: true,
          draftData: true,
          outputUrl: true,
          siteId: true,
          site: { select: JOB_LIST_SITE_SELECT },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.articleJob.count({ where }),
    ]);

    const items = rows.map((row) => this.toListItem(row));

    return { items, total, page: Math.max(page, 1), limit: safeLimit };
  }

  private applyKeywordToAndFilters(
    andFilters: Prisma.ArticleJobWhereInput[],
    keyword?: string,
  ): void {
    const q = keyword?.trim();
    if (!q) return;
    andFilters.push({
      targetKeyword: { contains: q, mode: 'insensitive' },
    });
  }

  private matchesKeyword(targetKeyword: string, keyword?: string): boolean {
    const q = keyword?.trim();
    if (!q) return true;
    return targetKeyword.toLowerCase().includes(q.toLowerCase());
  }

  private buildSiteWhere(siteScope: {
    siteId?: string;
    siteIds?: string[];
  }): Prisma.ArticleJobWhereInput {
    if (siteScope.siteId) {
      return { siteId: siteScope.siteId };
    }
    if (siteScope.siteIds?.length) {
      return { siteId: { in: siteScope.siteIds } };
    }
    return {};
  }

  private async resolveSiteScopeFilter(
    organizationId: string,
    projectId: string,
    siteId: string | undefined,
    siteOwnerMe: boolean | undefined,
    actorUserId: string | undefined,
  ): Promise<{ siteId?: string; siteIds?: string[]; empty?: boolean }> {
    if (!siteOwnerMe || !actorUserId) {
      return siteId ? { siteId } : {};
    }

    const ownedSiteIds = await this.siteService.listOwnedSiteIds(
      organizationId,
      projectId,
      actorUserId,
    );
    if (ownedSiteIds.length === 0) {
      return { empty: true };
    }
    if (siteId) {
      return ownedSiteIds.includes(siteId) ? { siteId } : { empty: true };
    }
    return { siteIds: ownedSiteIds };
  }

  private async findManyStaleDraft(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    siteScope: { siteId?: string; siteIds?: string[] } = {},
    keyword?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: { notIn: ['FAILED', 'QUEUED'] },
        ...this.buildSiteWhere(siteScope),
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        searchIntent: true,
        semrushScore: true,
        localSeoScore: true,
        errorMessage: true,
        seoCheckData: true,
        briefData: true,
        draftData: true,
        outputUrl: true,
        siteId: true,
        site: { select: JOB_LIST_SITE_SELECT },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const stale = rows.filter(
      (row) =>
        this.isDraftStale(row.draftData) &&
        this.matchesKeyword(row.targetKeyword, keyword),
    );
    const total = stale.length;
    const skip = (safePage - 1) * safeLimit;
    const items = stale.slice(skip, skip + safeLimit).map((row) => this.toListItem(row));

    return { items, total, page: safePage, limit: safeLimit };
  }

  private async findManySeoNotReady(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    siteScope: { siteId?: string; siteIds?: string[] } = {},
    keyword?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
        outputUrl: { not: null },
        ...this.buildSiteWhere(siteScope),
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        searchIntent: true,
        semrushScore: true,
        localSeoScore: true,
        errorMessage: true,
        seoCheckData: true,
        briefData: true,
        draftData: true,
        outputUrl: true,
        siteId: true,
        site: { select: JOB_LIST_SITE_SELECT },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const notReady = rows.filter(
      (row) =>
        !this.isJobReleaseReady(row) &&
        this.matchesKeyword(row.targetKeyword, keyword),
    );
    const total = notReady.length;
    const skip = (safePage - 1) * safeLimit;
    const items = notReady.slice(skip, skip + safeLimit).map((row) => this.toListItem(row));

    return { items, total, page: safePage, limit: safeLimit };
  }

  private async findManyReviewPending(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    siteScope: { siteId?: string; siteIds?: string[] } = {},
    keyword?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
        seoCheckData: {
          path: ['ymylReview', 'requires_human_review'],
          equals: true,
        },
        ...this.buildSiteWhere(siteScope),
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        searchIntent: true,
        semrushScore: true,
        localSeoScore: true,
        errorMessage: true,
        seoCheckData: true,
        briefData: true,
        draftData: true,
        outputUrl: true,
        siteId: true,
        site: { select: JOB_LIST_SITE_SELECT },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const pending = rows.filter(
      (row) =>
        isPendingHumanReview(row.seoCheckData) &&
        this.matchesKeyword(row.targetKeyword, keyword),
    );
    const total = pending.length;
    const skip = (safePage - 1) * safeLimit;
    const items = pending.slice(skip, skip + safeLimit).map((row) => this.toListItem(row));

    return { items, total, page: safePage, limit: safeLimit };
  }

  private isDraftStale(draftData: unknown): boolean {
    const staleness = (draftData as { staleness?: DraftStaleness | null } | null)?.staleness;
    return hasActiveStaleness(staleness);
  }

  private async findManyCmsPublishPending(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    siteScope: { siteId?: string; siteIds?: string[] } = {},
    keyword?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
        outputUrl: { not: null },
        ...this.buildSiteWhere(siteScope),
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        searchIntent: true,
        semrushScore: true,
        localSeoScore: true,
        errorMessage: true,
        seoCheckData: true,
        briefData: true,
        draftData: true,
        outputUrl: true,
        siteId: true,
        site: { select: JOB_LIST_SITE_SELECT },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const pending = rows.filter(
      (row) =>
        this.isCmsPublishPending(row.seoCheckData, row.site.cmsType) &&
        this.isJobReleaseReady(row) &&
        this.matchesKeyword(row.targetKeyword, keyword),
    );
    const total = pending.length;
    const skip = (safePage - 1) * safeLimit;
    const items = pending.slice(skip, skip + safeLimit).map((row) => this.toListItem(row));

    return { items, total, page: safePage, limit: safeLimit };
  }

  private async findManyCmsPublishFailed(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    siteScope: { siteId?: string; siteIds?: string[] } = {},
    keyword?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
        outputUrl: { not: null },
        ...this.buildSiteWhere(siteScope),
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        searchIntent: true,
        semrushScore: true,
        localSeoScore: true,
        errorMessage: true,
        seoCheckData: true,
        briefData: true,
        draftData: true,
        outputUrl: true,
        siteId: true,
        site: { select: JOB_LIST_SITE_SELECT },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const failed = rows.filter(
      (row) =>
        this.isCmsPublishFailed(row.seoCheckData) &&
        this.matchesKeyword(row.targetKeyword, keyword),
    );
    const total = failed.length;
    const skip = (safePage - 1) * safeLimit;
    const items = failed.slice(skip, skip + safeLimit).map((row) => this.toListItem(row));

    return { items, total, page: safePage, limit: safeLimit };
  }

  private isJobReleaseReady(row: {
    localSeoScore: number | null;
    semrushScore: number | null;
    seoCheckData: unknown;
  }): boolean {
    const thresholds = (row.seoCheckData as {
      scoreThresholds?: {
        localPassThreshold?: number;
        semrushPassThreshold?: number;
      };
    } | null)?.scoreThresholds;

    return evaluateReleaseReadiness({
      localScore: row.localSeoScore,
      semrushScore: row.semrushScore,
      localPassThreshold: thresholds?.localPassThreshold,
      semrushPassThreshold: thresholds?.semrushPassThreshold,
    }).releaseReady;
  }

  private isCmsPublishFailed(seoCheckData: unknown): boolean {
    const cms = (seoCheckData as { cmsPublish?: { lastError?: string; postUrl?: string | null } } | null)
      ?.cmsPublish;
    return Boolean(cms?.lastError && !cms?.postUrl);
  }

  private isCmsPublishPending(
    seoCheckData: unknown,
    siteCmsType: string | null,
  ): boolean {
    if (!siteCmsType || (siteCmsType !== 'wordpress' && siteCmsType !== 'shopify')) {
      return false;
    }
    if (!canPublishArticle(seoCheckData)) {
      return false;
    }
    if (this.isCmsPublishFailed(seoCheckData)) {
      return false;
    }
    const cms = (seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish;
    return !cms?.postUrl;
  }

  private toListItem(row: {
    id: string;
    traceId: string;
    status: string;
    targetKeyword: string;
    searchIntent: string | null;
    semrushScore: number | null;
    localSeoScore: number | null;
    errorMessage: string | null;
    seoCheckData: unknown;
    briefData: unknown;
    draftData: unknown;
    outputUrl: string | null;
    siteId: string;
    site: { domain: string; cmsType: string | null; cmsConfig: unknown };
    createdAt: Date;
    updatedAt: Date;
  }) {
    const shopifyConfig =
      row.site.cmsType === 'shopify'
        ? parseShopifyCmsConfig('shopify', row.site.cmsConfig)
        : null;
    const seoCheckData = row.seoCheckData as {
      ymylReview?: { requires_human_review?: boolean; reviewedAt?: string };
      workflowProgress?: {
        phase?: string;
        round?: number;
        maxRounds?: number;
        message?: string;
        localScore?: number;
        semrushScore?: number;
        updatedAt?: string;
      } | null;
      workflow?: { failedStep?: string };
      cmsPublish?: {
        postUrl?: string | null;
        status?: string;
        lastError?: string;
        publishTarget?: 'blog' | 'product';
      };
    } | null;
    const draftData = row.draftData as {
      internalLinks?: unknown[];
      internalLinksApplied?: boolean;
    } | null;

    return {
      id: row.id,
      traceId: row.traceId,
      status: row.status,
      targetKeyword: row.targetKeyword,
      searchIntent: row.searchIntent,
      semrushScore: row.semrushScore,
      localSeoScore: row.localSeoScore,
      errorMessage: row.errorMessage,
      outputUrl: row.outputUrl,
      siteId: row.siteId,
      siteDomain: row.site.domain,
      siteCmsType: row.site.cmsType,
      siteShopifyPublishTarget: shopifyConfig?.publishTarget ?? null,
      briefData: isBriefApprovalPending(row.briefData)
        ? { approvalStatus: 'pending' as const }
        : null,
      seoCheckData: seoCheckData
        ? {
            workflowProgress: seoCheckData.workflowProgress ?? null,
            workflow: seoCheckData.workflow,
            cmsPublish: seoCheckData.cmsPublish ?? null,
          }
        : null,
      requiresHumanReview: seoCheckData?.ymylReview?.requires_human_review === true,
      ymylReviewCompleted: Boolean(seoCheckData?.ymylReview?.reviewedAt),
      reviewPending:
        row.status === 'COMPLETED' && isPendingHumanReview(seoCheckData),
      exportReady:
        row.status === 'COMPLETED' &&
        Boolean(row.outputUrl) &&
        canPublishArticle(seoCheckData),
      internalLinkCount: draftData?.internalLinksApplied
        ? (draftData.internalLinks?.length ?? 0)
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findOne(organizationId: string, projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        searchIntent: true,
        semrushScore: true,
        localSeoScore: true,
        seoCheckData: true,
        outputUrl: true,
        errorMessage: true,
        serpData: true,
        briefData: true,
        draftData: true,
        siteId: true,
        createdAt: true,
        updatedAt: true,
        site: {
          select: {
            domain: true,
            cmsType: true,
            cmsConfig: true,
            settings: true,
          },
        },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const shopifyConfig =
      job.site.cmsType === 'shopify'
        ? parseShopifyCmsConfig('shopify', job.site.cmsConfig)
        : null;
    const draftData = job.draftData as {
      internalLinks?: unknown[];
      internalLinksApplied?: boolean;
    } | null;

    const { site, ...jobRest } = job;

    const gscPerformance = await this.gscService.getJobPagePerformance(
      organizationId,
      projectId,
      id,
    );

    return {
      ...jobRest,
      siteDomain: site.domain,
      siteCmsType: site.cmsType,
      siteShopifyPublishTarget: shopifyConfig?.publishTarget ?? null,
      siteContentProfile: parseSiteSettings(site.settings).contentProfile ?? null,
      siteWorkflow: resolveSiteSeoScoreConfig(site.settings),
      internalLinkCount: draftData?.internalLinksApplied
        ? (draftData.internalLinks?.length ?? 0)
        : null,
      gscPerformance,
    };
  }

  /** 签名 URL 读取稿件插图时解析租户（无需登录态） */
  async findOneForImageAccess(projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, projectId },
      select: { organizationId: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    return job;
  }

  /** 手动触发 Semrush RPA 检测当前初稿（异步，立即返回 OPTIMIZING） */
  async triggerSemrushCheck(organizationId: string, projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = job.draftData as { content?: string } | null;
    if (!draft?.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法检测');
    }

    const ctx = {
      jobId: id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };

    let pending = this.getSemrushPending(job.seoCheckData);
    if (job.status === 'OPTIMIZING') {
      if (pending && isSemrushCheckStale(pending.startedAt)) {
        await this.seoCheckerService.cancelManualSemrushCheck(
          ctx,
          '上次 Semrush 检测已超时，正在重新发起',
        );
        pending = null;
      } else if (pending) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Semrush 检测进行中，请稍候');
      } else if (shouldRecoverOrphanOptimizing(job)) {
        await this.seoCheckerService.recoverOrphanOptimizingJob(
          ctx,
          '检测到僵死的优化状态，已自动恢复并重新发起检测',
        );
      } else {
        throw new BusinessException(
          ErrorCodes.VALIDATION_ERROR,
          '任务优化进行中，请稍候；若长时间无响应可点「取消检测」或等待约 8 分钟后重试',
        );
      }
    }

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id },
      data: {
        status: 'OPTIMIZING',
        errorMessage: null,
        seoCheckData: {
          ...prevCheck,
          semrush: {
            ...prevSemrush,
            manualCheckPreviousStatus: job.status,
            pending: {
              startedAt: new Date().toISOString(),
              previousStatus: job.status,
            } satisfies SemrushCheckPending,
          },
        } as object,
      },
    });

    void this.seoCheckerService.runManualSemrushCheck(ctx).catch(async (error) => {
      if (this.seoCheckerService.isSemrushWorkAbortedError(error)) {
        return;
      }
      const message = this.resolveErrorMessage(error, 'Semrush 检测失败');
      await this.seoCheckerService.markManualSemrushFailed(ctx, message);
    });

    this.logger.info('Manual Semrush check triggered', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId: id,
      action: 'article_job.semrush_check_trigger',
    });

    return {
      id: job.id,
      traceId: job.traceId,
      status: 'OPTIMIZING' as const,
      targetKeyword: job.targetKeyword,
    };
  }

  /** 重新拉取 SERP 并抓取竞品正文（不改动大纲/初稿） */
  async refreshSerp(
    organizationId: string,
    projectId: string,
    id: string,
    dto: RefreshArticleJobSerpDto = {},
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        contentLanguage: true,
        serpData: true,
        site: { select: { targetMarket: true, settings: true } },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.status === 'QUEUED' || job.status === 'RESEARCHING') {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '任务检索进行中，请稍后再试');
    }

    const serpData = job.serpData as {
      filterMeta?: { limit?: number; articlesOnly?: boolean };
    } | null;

    const serp = resolveSerpResearchOptions(job.site.settings, {
      serpArticleLimit: dto.serpArticleLimit ?? serpData?.filterMeta?.limit,
      serpArticlesOnly: dto.serpArticlesOnly ?? serpData?.filterMeta?.articlesOnly,
      bypassCache: dto.bypassCache ?? true,
    });

    await this.scraperService.researchSerp({
      jobId: job.id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
      targetMarket: serp.serpCountry,
      contentLanguage: job.contentLanguage,
      serpArticleLimit: serp.serpArticleLimit,
      serpArticlesOnly: serp.serpArticlesOnly,
      organicFetchNum: serp.organicFetchNum,
      minArticleCandidates: serp.minArticleCandidates,
      cacheTtlSeconds: serp.cacheTtlSeconds,
      bypassCache: dto.bypassCache ?? true,
    });

    this.logger.info('Article job SERP refreshed', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId: job.id,
      action: 'article_job.refresh_serp',
    });

    return {
      id: job.id,
      traceId: job.traceId,
      targetKeyword: job.targetKeyword,
    };
  }

  /** 已完成任务重新跑 SEO 优化（本地 + Semrush + QuillBot + YMYL），用于 GSC 偏弱改稿后刷新评分 */
  async rerunOptimization(
    organizationId: string,
    projectId: string,
    id: string,
    reason: 'gsc_underperform' | 'manual' = 'manual',
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        seoCheckData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const busyStatuses = [
      'QUEUED',
      'RESEARCHING',
      'DRAFTING',
      'LINKING',
      'ILLUSTRATING',
      'OPTIMIZING',
      'REVIEWING',
    ] as const;
    if (busyStatuses.includes(job.status as (typeof busyStatuses)[number])) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '任务进行中，请稍后再试');
    }

    if (job.status !== 'COMPLETED') {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅已完成任务可重新优化评分');
    }

    const draft = job.draftData as { content?: string } | null;
    if (!draft?.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法重新优化');
    }

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevLocal = (prevCheck.local ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const retryTraceId = `tr_${uuidv4()}`;

    await this.prisma.articleJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        traceId: retryTraceId,
        seoCheckData: withWorkflowMeta(
          {
            ...prevCheck,
            optimizationRerun: {
              reason,
              requestedAt: new Date().toISOString(),
            },
            local: { ...prevLocal, passed: false },
            semrush: { ...prevSemrush, passed: false },
          },
          null,
        ) as object,
      },
    });

    await this.enqueueArticleJob(
      {
        jobId: job.id,
        traceId: retryTraceId,
        organizationId,
        projectId,
        resumeFrom: 'optimizing',
      },
      `rerun_opt_${job.id}_${Date.now()}`,
    );

    this.logger.info('Article job optimization rerun enqueued', {
      traceId: retryTraceId,
      organizationId,
      projectId,
      jobId: job.id,
      reason,
      action: 'article_job.rerun_optimization',
    });

    return {
      id: job.id,
      traceId: retryTraceId,
      status: 'QUEUED' as const,
      targetKeyword: job.targetKeyword,
    };
  }

  /** 已完成任务仅重跑原创表达优化（M7）及后续 YMYL、导出 */
  async rerunParaphrase(organizationId: string, projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        seoCheckData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const busyStatuses = [
      'QUEUED',
      'RESEARCHING',
      'DRAFTING',
      'LINKING',
      'ILLUSTRATING',
      'OPTIMIZING',
      'REVIEWING',
    ] as const;
    if (busyStatuses.includes(job.status as (typeof busyStatuses)[number])) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '任务进行中，请稍后再试');
    }

    if (job.status !== 'COMPLETED') {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅已完成任务可重新润色');
    }

    const draft = job.draftData as { content?: string; paraphraseApplied?: boolean } | null;
    if (!draft?.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法重新润色');
    }

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const { quillbot: _removed, ...restCheck } = prevCheck;
    const retryTraceId = `tr_${uuidv4()}`;

    await this.prisma.articleJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        traceId: retryTraceId,
        draftData: {
          ...(draft as object),
          paraphraseApplied: false,
          paraphraseOriginalContent: undefined,
        } as object,
        seoCheckData: withWorkflowMeta(restCheck, null) as object,
      },
    });

    await this.enqueueArticleJob(
      {
        jobId: job.id,
        traceId: retryTraceId,
        organizationId,
        projectId,
        resumeFrom: 'paraphrasing',
      },
      `rerun_para_${job.id}_${Date.now()}`,
    );

    this.logger.info('Article job paraphrase rerun enqueued', {
      traceId: retryTraceId,
      organizationId,
      projectId,
      jobId: job.id,
      action: 'article_job.rerun_paraphrase',
    });

    return {
      id: job.id,
      traceId: retryTraceId,
      status: 'QUEUED' as const,
      targetKeyword: job.targetKeyword,
    };
  }

  /** 失败任务重新入队，从失败步骤续跑（不重复已完成阶段） */
  async retry(organizationId: string, projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        serpData: true,
        briefData: true,
        draftData: true,
        seoCheckData: true,
        semrushScore: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.status !== 'FAILED') {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅失败状态的任务可重试');
    }

    const resumeFrom = resolveResumeStep(job);
    const retryTraceId = `tr_${uuidv4()}`;

    // 清除上次「Semrush 检测已取消」标记，否则续跑到 optimizing 时
    // assertSemrushWorkNotCancelled 会立即再次中止。
    const baseCheck = withWorkflowMeta(job.seoCheckData, null);
    const prevSemrush = baseCheck.semrush as Record<string, unknown> | undefined;
    const retrySeoCheckData = prevSemrush
      ? (() => {
          const { cancelled: _cancelled, ...semrushRest } = prevSemrush;
          return { ...baseCheck, semrush: semrushRest };
        })()
      : baseCheck;

    await this.prisma.articleJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        traceId: retryTraceId,
        seoCheckData: retrySeoCheckData as object,
      },
    });

    await this.enqueueArticleJob(
      {
        jobId: job.id,
        traceId: retryTraceId,
        organizationId,
        projectId,
        resumeFrom,
      },
      `retry_${job.id}_${Date.now()}`,
    );

    this.logger.info('Article job retry enqueued', {
      traceId: retryTraceId,
      organizationId,
      projectId,
      jobId: job.id,
      resumeFrom,
      action: 'article_job.retry',
    });

    return {
      id: job.id,
      traceId: retryTraceId,
      status: 'QUEUED' as const,
      targetKeyword: job.targetKeyword,
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
        const data = await this.retry(organizationId, projectId, jobId);
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

  /** 删除任务及队列、稿件插图等关联数据 */
  async remove(organizationId: string, projectId: string, id: string, traceId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        targetKeyword: true,
        status: true,
        seoCheckData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.id.startsWith(CALIBRATION_LAB_JOB_ID_PREFIX)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '校准实验室样本请在校准页删除');
    }

    await this.cleanupBeforeDelete(organizationId, projectId, job);

    await this.prisma.articleJob.delete({
      where: { id: job.id },
    });

    this.logger.info('Article job deleted', {
      traceId,
      organizationId,
      projectId,
      jobId: job.id,
      targetKeyword: job.targetKeyword,
      action: 'article_job.delete',
    });

    return {
      id: job.id,
      targetKeyword: job.targetKeyword,
      deleted: true as const,
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
        const data = await this.remove(organizationId, projectId, jobId, traceId);
        results.push({ jobId, ok: true, data });
      } catch (error) {
        results.push({
          jobId,
          ok: false,
          error: this.resolveErrorMessage(error, '删除失败'),
        });
      }
    }

    return {
      deleted: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }

  private async cleanupBeforeDelete(
    organizationId: string,
    projectId: string,
    job: {
      id: string;
      traceId: string;
      targetKeyword: string;
      seoCheckData: unknown;
    },
  ): Promise<void> {
    const ctx = {
      jobId: job.id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };

    const pending = this.getSemrushPending(job.seoCheckData);
    if (pending) {
      try {
        await this.seoCheckerService.cancelManualSemrushCheck(ctx, '任务已删除，Semrush 检测已取消');
      } catch (error) {
        this.logger.warn('Cancel Semrush check before delete failed', {
          traceId: job.traceId,
          organizationId,
          projectId,
          jobId: job.id,
          action: 'article_job.delete_cancel_semrush_failed',
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    const [articleQueueRemoved, playwrightQueueRemoved] = await Promise.all([
      removeBullJobsByArticleJobId(this.articleJobQueue, job.id),
      removeBullJobsByArticleJobId(this.playwrightQueue, job.id),
    ]);

    if (articleQueueRemoved > 0 || playwrightQueueRemoved > 0) {
      this.logger.info('Removed pending queue jobs before article job delete', {
        traceId: job.traceId,
        organizationId,
        projectId,
        jobId: job.id,
        action: 'article_job.delete_queue_cleanup',
        articleQueueRemoved,
        playwrightQueueRemoved,
      });
    }

    await this.storage.deleteByPrefix(`${buildExportStoragePrefix(organizationId, projectId, job.id)}/`);
  }

  async cancelSemrushCheck(organizationId: string, projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const pending = this.getSemrushPending(job.seoCheckData);
    const ctx = {
      jobId: id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };

    if (!pending) {
      if (job.status === 'OPTIMIZING') {
        if (shouldRecoverOrphanOptimizing(job)) {
          const restoreStatus = await this.seoCheckerService.recoverOrphanOptimizingJob(
            ctx,
            'Semrush 检测已手动取消（僵死优化状态）',
          );
          return {
            id: job.id,
            traceId: job.traceId,
            status: restoreStatus,
            targetKeyword: job.targetKeyword,
          };
        }
        throw new BusinessException(
          ErrorCodes.VALIDATION_ERROR,
          '任务优化或 Semrush 终检进行中，请稍候；若长时间无响应可等待约 8 分钟后重试',
        );
      }
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '当前没有进行中的 Semrush 检测');
    }

    await this.seoCheckerService.cancelManualSemrushCheck(ctx, 'Semrush 检测已手动取消');

    return {
      id: job.id,
      traceId: job.traceId,
      status: pending.previousStatus,
      targetKeyword: job.targetKeyword,
    };
  }

  private buildScraperOptions(
    dto: Pick<CreateArticleJobDto, 'serpArticleLimit' | 'serpArticlesOnly'>,
  ): ArticleJobScraperOptions | undefined {
    if (dto.serpArticleLimit === undefined && dto.serpArticlesOnly === undefined) {
      return undefined;
    }

    return {
      serpArticleLimit: dto.serpArticleLimit,
      serpArticlesOnly: dto.serpArticlesOnly,
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
      });
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

  private async resolveSearchIntent(
    organizationId: string,
    projectId: string,
    targetKeyword: string,
    explicit?: string,
  ): Promise<KeywordIntentValue> {
    if (explicit) {
      return normalizeKeywordIntent(explicit);
    }

    const entry = await this.prisma.keywordEntry.findFirst({
      where: { organizationId, projectId, keyword: targetKeyword },
      orderBy: { updatedAt: 'desc' },
      select: { intent: true },
    });

    return normalizeKeywordIntent(entry?.intent);
  }

  private getSemrushPending(seoCheckData: unknown): SemrushCheckPending | null {
    const data = (seoCheckData ?? {}) as { semrush?: { pending?: SemrushCheckPending } };
    return data.semrush?.pending ?? null;
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof BusinessException) {
      const body = error.getResponse();
      if (typeof body === 'object' && body !== null && 'message' in body) {
        return String((body as { message: string }).message);
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  }

  async getProjectStats(
    organizationId: string,
    projectId: string,
    siteId?: string,
    actorUserId?: string,
  ) {
    const jobWhere = { organizationId, projectId, ...(siteId ? { siteId } : {}) };
    const siteWhere = { organizationId, projectId, ...(siteId ? { id: siteId } : {}) };
    const keywordWhere = {
      organizationId,
      projectId,
      ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
    };
    const activeStatusFilter = { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] };

    const [totalJobs, completedJobs, failedJobs, activeJobs, queuedJobs, optimizingJobs, ymylCandidates, pendingBriefJobs, publishCandidates, staleDraftCandidates, siteRows, keywordTotalCount, keywordQueueableCount, keywordUnclusteredCount] =
      await Promise.all([
        this.prisma.articleJob.count({ where: jobWhere }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'COMPLETED' },
        }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'FAILED' },
        }),
        this.prisma.articleJob.count({
          where: {
            ...jobWhere,
            status: activeStatusFilter,
          },
        }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'QUEUED' },
        }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'OPTIMIZING' },
        }),
        this.prisma.articleJob.findMany({
          where: {
            ...jobWhere,
            status: 'COMPLETED',
            seoCheckData: {
              path: ['ymylReview', 'requires_human_review'],
              equals: true,
            },
          },
          select: { seoCheckData: true },
        }),
        this.prisma.articleJob.count({
          where: {
            ...jobWhere,
            status: 'DRAFTING',
            briefData: {
              path: ['approvalStatus'],
              equals: 'pending',
            },
          },
        }),
        this.prisma.articleJob.findMany({
          where: {
            ...jobWhere,
            status: 'COMPLETED',
            outputUrl: { not: null },
          },
          select: { seoCheckData: true },
        }),
        this.prisma.articleJob.findMany({
          where: {
            ...jobWhere,
            status: { notIn: ['FAILED', 'QUEUED'] },
          },
          select: { draftData: true },
          take: 500,
        }),
        this.prisma.site.findMany({
          where: siteWhere,
          select: {
            settings: true,
            gscConnection: { select: { refreshToken: true, lastSyncAt: true } },
          },
        }),
        this.prisma.keywordEntry.count({ where: keywordWhere }),
        this.prisma.keywordEntry.count({
          where: {
            ...keywordWhere,
            status: { in: [KeywordStatus.PENDING, KeywordStatus.APPROVED] },
          },
        }),
        this.prisma.keywordEntry.count({
          where: { ...keywordWhere, clusterId: null },
        }),
      ]);

    const pendingReviewCount = ymylCandidates.filter((row) =>
      isPendingHumanReview(row.seoCheckData),
    ).length;

    const pendingPublishCount = publishCandidates.filter((row) => {
      const cmsPublish = (row.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)
        ?.cmsPublish;
      return !cmsPublish?.postUrl;
    }).length;

    const cmsPublishFailedCount = publishCandidates.filter((row) =>
      this.isCmsPublishFailed(row.seoCheckData),
    ).length;

    const staleDraftCount = staleDraftCandidates.filter((row) =>
      this.isDraftStale(row.draftData),
    ).length;

    const siteCount = siteRows.length;
    const sitesMissingProfileCount = siteRows.filter(
      (row) => !siteHasWritingProfile(row.settings),
    ).length;
    const gscPendingSyncCount = siteRows.filter(
      (row) => row.gscConnection?.refreshToken && !row.gscConnection.lastSyncAt,
    ).length;
    const gscStaleSyncMs = 7 * 24 * 60 * 60 * 1000;
    const gscStaleSyncCount = siteRows.filter((row) => {
      const lastSyncAt = row.gscConnection?.lastSyncAt;
      if (!row.gscConnection?.refreshToken || !lastSyncAt) return false;
      return Date.now() - lastSyncAt.getTime() > gscStaleSyncMs;
    }).length;

    const gscUnderperformingJobs =
      gscPendingSyncCount > 0
        ? []
        : await this.gscService.getUnderperformingJobs(organizationId, projectId, siteId);

    let myAssignedCount = 0;
    let canReviewInProject = false;
    if (actorUserId) {
      myAssignedCount = await this.prisma.articleJobAssignee.count({
        where: {
          userId: actorUserId,
          job: {
            organizationId,
            projectId,
            ...(siteId ? { siteId } : {}),
            status: { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] },
          },
        },
      });

      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actorUserId } },
        select: { id: true, role: true },
      });
      if (member) {
        const project = await this.prisma.project.findFirst({
          where: { id: projectId, organizationId },
          select: { projectType: true },
        });
        if (project) {
          const perms = await this.projectAccessService.resolveMemberPermissions(
            member.id,
            member.role,
            project.projectType,
          );
          canReviewInProject = canReviewInSeoProject(perms);
        }
      }
    }

    const myReviewPendingCount = canReviewInProject
      ? pendingBriefJobs + pendingReviewCount
      : 0;

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      activeJobs,
      queuedJobs,
      optimizingJobs,
      pendingBriefCount: pendingBriefJobs,
      pendingPublishCount,
      cmsPublishFailedCount,
      pendingReviewCount,
      staleDraftCount,
      siteCount,
      sitesMissingProfileCount,
      gscPendingSyncCount,
      gscStaleSyncCount,
      gscUnderperformingCount: gscUnderperformingJobs.length,
      gscUnderperformingJobs,
      keywordTotalCount,
      keywordQueueableCount,
      keywordUnclusteredCount,
      myAssignedCount,
      myReviewPendingCount,
      canReviewInProject,
    };
  }
}
