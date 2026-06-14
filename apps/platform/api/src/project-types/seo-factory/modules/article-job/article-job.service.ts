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
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { isSeoArticleUrl, keywordFromArticleUrl, normalizeContentLanguage } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { ARTICLE_JOB_QUEUE } from '../../../../core/queue/queue.constants';
import type {
  ArticleJobQueuePayload,
  ArticleJobScraperOptions,
} from '../../processors/article-job.processor';
import {
  DEFAULT_BATCH_JOB_LIMIT,
  MAX_BATCH_JOB_LIMIT,
} from '../../constants/serp-filter';
import type { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import type { CreateArticleJobDto } from './dto/create-article-job.dto';
import { SiteArticleCrawlerService } from '../site/site-article-crawler.service';
import {
  isSemrushCheckStale,
  shouldRecoverOrphanOptimizing,
  type SemrushCheckPending,
} from '../../constants/semrush-check';
import { resolveResumeStep, withWorkflowMeta } from '../../constants/workflow-resume';
import { isPendingHumanReview } from '../content-review/ymyl-detect.util';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import { BillingService } from '../../../../modules/billing/billing.service';

@Injectable()
export class ArticleJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly siteArticleCrawler: SiteArticleCrawlerService,
    private readonly billingService: BillingService,
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleJobQueue: Queue<ArticleJobQueuePayload>,
  ) {}

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

    const job = await this.prisma.articleJob.create({
      data: {
        traceId,
        organizationId,
        projectId,
        siteId: dto.siteId,
        targetKeyword: dto.targetKeyword,
        contentLanguage,
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

    await this.articleJobQueue.add(
      'generate',
      {
        jobId: job.id,
        traceId,
        organizationId,
        projectId,
        scraperOptions,
      },
      { jobId: traceId },
    );

    this.logger.info('Article job created and enqueued', {
      traceId,
      organizationId,
      projectId,
      jobId: job.id,
      action: 'article_job.create',
      scraperOptions,
    });

    return job;
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

  async findMany(organizationId: string, projectId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      this.prisma.articleJob.findMany({
        where: { organizationId, projectId },
        select: {
          id: true,
          traceId: true,
          status: true,
          targetKeyword: true,
          semrushScore: true,
          localSeoScore: true,
          errorMessage: true,
          seoCheckData: true,
          draftData: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.articleJob.count({ where: { organizationId, projectId } }),
    ]);

    const items = rows.map((row) => this.toListItem(row));

    return { items, total, page: Math.max(page, 1), limit: safeLimit };
  }

  private toListItem(row: {
    id: string;
    traceId: string;
    status: string;
    targetKeyword: string;
    semrushScore: number | null;
    localSeoScore: number | null;
    errorMessage: string | null;
    seoCheckData: unknown;
    draftData: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
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
      semrushScore: row.semrushScore,
      localSeoScore: row.localSeoScore,
      errorMessage: row.errorMessage,
      seoCheckData: seoCheckData
        ? {
            workflowProgress: seoCheckData.workflowProgress ?? null,
            workflow: seoCheckData.workflow,
          }
        : null,
      requiresHumanReview: seoCheckData?.ymylReview?.requires_human_review === true,
      ymylReviewCompleted: Boolean(seoCheckData?.ymylReview?.reviewedAt),
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
        semrushScore: true,
        localSeoScore: true,
        seoCheckData: true,
        outputUrl: true,
        errorMessage: true,
        serpData: true,
        briefData: true,
        draftData: true,
        createdAt: true,
        updatedAt: true,
      },
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
            pending: {
              startedAt: new Date().toISOString(),
              previousStatus: job.status,
            } satisfies SemrushCheckPending,
          },
        } as object,
      },
    });

    void this.seoCheckerService.runManualSemrushCheck(ctx).catch(async (error) => {
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

    await this.prisma.articleJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        traceId: retryTraceId,
        seoCheckData: withWorkflowMeta(job.seoCheckData, null) as object,
      },
    });

    await this.articleJobQueue.add(
      'generate',
      {
        jobId: job.id,
        traceId: retryTraceId,
        organizationId,
        projectId,
        resumeFrom,
      },
      { jobId: `retry_${job.id}_${Date.now()}` },
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

  async getProjectStats(organizationId: string, projectId: string) {
    const terminalStatuses = ['COMPLETED', 'FAILED'] as const;

    const [totalJobs, completedJobs, failedJobs, activeJobs, ymylCandidates, siteCount] =
      await Promise.all([
        this.prisma.articleJob.count({ where: { organizationId, projectId } }),
        this.prisma.articleJob.count({
          where: { organizationId, projectId, status: 'COMPLETED' },
        }),
        this.prisma.articleJob.count({
          where: { organizationId, projectId, status: 'FAILED' },
        }),
        this.prisma.articleJob.count({
          where: {
            organizationId,
            projectId,
            status: { notIn: [...terminalStatuses] },
          },
        }),
        this.prisma.articleJob.findMany({
          where: {
            organizationId,
            projectId,
            status: 'COMPLETED',
            seoCheckData: {
              path: ['ymylReview', 'requires_human_review'],
              equals: true,
            },
          },
          select: { seoCheckData: true },
        }),
        this.prisma.site.count({ where: { organizationId, projectId } }),
      ]);

    const pendingReviewCount = ymylCandidates.filter((row) =>
      isPendingHumanReview(row.seoCheckData),
    ).length;

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      activeJobs,
      pendingReviewCount,
      siteCount,
    };
  }
}
