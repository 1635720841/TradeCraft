/**
 * 文章任务列表与详情查询。
 *
 * 边界：
 * - 不负责：创建、入队、删除（ArticleJobService）
 *
 * 入口：
 * - ArticleJobListService
 */

import { Injectable } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { evaluateReleaseReadiness } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { isBriefApprovalPending } from '../../constants/brief-approval';
import { parseSiteSettings } from '../../constants/site-settings';
import { resolveSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import { CALIBRATION_LAB_JOB_ID_PREFIX } from '../../utils/score-calibration-manual-samples.util';
import { canPublishArticle, isPendingHumanReview } from '../content-review/ymyl-detect.util';
import { parseShopifyCmsConfig } from '../site/site-cms.util';
import { SiteService } from '../site/site.service';
import { GscService } from '../gsc/gsc.service';
import { isArticleDraftStale, isCmsPublishFailed } from './article-job-stage.util';

export const JOB_LIST_SITE_SELECT = { domain: true, cmsType: true, cmsConfig: true } as const;

@Injectable()
export class ArticleJobListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteService: SiteService,
    private readonly gscService: GscService,
  ) {}

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
      needsAction?: boolean;
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

    if (options.needsAction) {
      options = {
        ...options,
        needsAction: undefined,
        status: 'FAILED',
      };
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
        isArticleDraftStale(row.draftData) &&
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
        isCmsPublishFailed(row.seoCheckData) &&
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
    if (isCmsPublishFailed(seoCheckData)) {
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
}
