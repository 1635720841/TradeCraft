/**
 * 文章任务服务：创建、入队与生命周期操作（列表/批量/队列委托子服务）。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowService）、外部 API（Provider）
 *
 * 入口：
 * - ArticleJobService
 */

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { normalizeContentLanguage } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { StorageService } from '../../../../core/storage/storage.service';
import type { ArticleJobScraperOptions } from '../../processors/article-job.processor';
import { CALIBRATION_LAB_JOB_ID_PREFIX } from '../../utils/score-calibration-manual-samples.util';
import { normalizeKeywordIntent, type KeywordIntentValue } from '../../constants/search-intent';
import { normalizeArticleContentForm } from '../../constants/content-form';
import type { CreateArticleJobDto } from './dto/create-article-job.dto';
import type { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import type { RefreshArticleJobSerpDto } from './dto/refresh-article-job-serp.dto';
import { resolveSerpResearchOptions, normalizeSerpCountry } from '../../constants/serp-research-settings';
import {
  buildArticleJobScraperOptions,
  getArticleJobConfig,
  withArticleJobConfig,
} from '../../constants/article-job-config';
import {
  isSemrushCheckStale,
  shouldRecoverOrphanOptimizing,
  type SemrushCheckPending,
} from '../../constants/semrush-check';
import { resolveResumeStep, withWorkflowMeta } from '../../constants/workflow-resume';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import { BillingService } from '../../../../modules/billing/billing.service';
import { ScraperService } from '../scraper/scraper.service';
import { findKeywordConflicts } from '../keyword-pool/keyword-cannibalization.util';
import { buildExportStoragePrefix } from '../export/export-html.util';
import { ArticleJobListService } from './article-job-list.service';
import { ArticleJobBatchService } from './article-job-batch.service';
import { ArticleJobQueueService } from './article-job-queue.service';

@Injectable()
export class ArticleJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly billingService: BillingService,
    private readonly scraperService: ScraperService,
    private readonly storage: StorageService,
    private readonly listService: ArticleJobListService,
    private readonly queueService: ArticleJobQueueService,
    @Inject(forwardRef(() => ArticleJobBatchService))
    private readonly batchService: ArticleJobBatchService,
  ) {}

  async create(organizationId: string, projectId: string, dto: CreateArticleJobDto) {
    await this.billingService.assertArticleQuota(organizationId, 1);

    const traceId = `tr_${uuidv4()}`;

    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, projectId },
      select: { id: true, contentLanguage: true, targetMarket: true, settings: true },
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

    const serpCountry = this.resolveJobSerpCountry(site, dto.serpCountry);

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
        seoCheckData: withArticleJobConfig(null, { serpCountry }) as object,
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        createdAt: true,
      },
    });

    const scraperOptions = this.buildScraperOptions(dto, serpCountry);

    await this.queueService.enqueueArticleJob(
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

  async createBatch(organizationId: string, projectId: string, dto: CreateBatchArticleJobsDto) {
    return this.batchService.createBatch(organizationId, projectId, dto);
  }

  async findMany(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
    options: Parameters<ArticleJobListService['findMany']>[4] = {},
  ) {
    return this.listService.findMany(organizationId, projectId, page, limit, options);
  }

  async findOne(organizationId: string, projectId: string, id: string) {
    return this.listService.findOne(organizationId, projectId, id);
  }

  async findOneForImageAccess(projectId: string, id: string) {
    return this.listService.findOneForImageAccess(projectId, id);
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
        seoCheckData: true,
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

    const jobConfig = getArticleJobConfig(job.seoCheckData);
    const serp = resolveSerpResearchOptions(
      job.site.settings,
      {
        serpCountry: jobConfig.serpCountry,
        serpArticleLimit: dto.serpArticleLimit ?? serpData?.filterMeta?.limit,
        serpArticlesOnly: dto.serpArticlesOnly ?? serpData?.filterMeta?.articlesOnly,
        bypassCache: dto.bypassCache ?? true,
      },
      { targetMarket: job.site.targetMarket },
    );

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

    await this.queueService.enqueueArticleJob(
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

    await this.queueService.enqueueArticleJob(
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
    const retryScraperOptions = buildArticleJobScraperOptions(getArticleJobConfig(job.seoCheckData));

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

    await this.queueService.enqueueArticleJob(
      {
        jobId: job.id,
        traceId: retryTraceId,
        organizationId,
        projectId,
        resumeFrom,
        scraperOptions: retryScraperOptions,
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
    return this.batchService.batchRetry(organizationId, projectId, jobIds);
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
    return this.batchService.batchRemove(organizationId, projectId, jobIds, traceId);
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

  buildScraperOptions(
    dto: Pick<CreateArticleJobDto, 'serpArticleLimit' | 'serpArticlesOnly' | 'serpCountry'>,
    resolvedSerpCountry?: string,
  ): ArticleJobScraperOptions | undefined {
    const serpCountry = normalizeSerpCountry(dto.serpCountry) ?? resolvedSerpCountry;
    if (
      dto.serpArticleLimit === undefined &&
      dto.serpArticlesOnly === undefined &&
      !serpCountry
    ) {
      return undefined;
    }

    return {
      serpArticleLimit: dto.serpArticleLimit,
      serpArticlesOnly: dto.serpArticlesOnly,
      serpCountry,
    };
  }

  resolveErrorMessage(error: unknown, fallback: string): string {
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

    await this.queueService.removeQueueJobsForArticleJob(job, organizationId, projectId);
    await this.storage.deleteByPrefix(`${buildExportStoragePrefix(organizationId, projectId, job.id)}/`);
  }

  private resolveJobSerpCountry(
    site: { targetMarket: string | null; settings: unknown },
    override?: string,
  ): string {
    return resolveSerpResearchOptions(
      site.settings,
      { serpCountry: override },
      { targetMarket: site.targetMarket },
    ).serpCountry;
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
}
