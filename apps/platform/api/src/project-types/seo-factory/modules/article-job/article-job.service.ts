/**
 * 文章任务服务：创建、入队与生命周期操作（列表/批量/队列委托子服务）。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowService）、外部 API（Provider）
 *
 * 入口：
 * - ArticleJobService
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import type { CreateArticleJobDto } from './dto/create-article-job.dto';
import type { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import type { RefreshArticleJobSerpDto } from './dto/refresh-article-job-serp.dto';
import { resolveSerpResearchOptions } from '../../constants/serp-research-settings';
import { getArticleJobConfig } from '../../constants/article-job-config';
import {
  isSemrushCheckStale,
  shouldRecoverOrphanOptimizing,
  getSemrushPending,
  type SemrushCheckPending,
} from '../../constants/semrush-check';
import {
  withWorkflowMeta,
} from '../../constants/workflow-resume';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import { BillingService } from '../../../../modules/billing/billing.service';
import { ScraperService } from '../scraper/scraper.service';
import { ArticleJobListService } from './article-job-list.service';
import { ArticleJobBatchService } from './article-job-batch.service';
import { ArticleJobQueueService } from './article-job-queue.service';
import { ArticleJobLifecycleService } from './article-job-lifecycle.service';
import { ArticleJobCreateService } from './article-job-create.service';
import { resolveArticleJobErrorMessage } from './article-job-error.util';

@Injectable()
export class ArticleJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly billingService: BillingService,
    private readonly scraperService: ScraperService,
    private readonly listService: ArticleJobListService,
    private readonly queueService: ArticleJobQueueService,
    private readonly batchService: ArticleJobBatchService,
    private readonly lifecycleService: ArticleJobLifecycleService,
    private readonly createService: ArticleJobCreateService,
  ) {}

  async create(organizationId: string, projectId: string, dto: CreateArticleJobDto) {
    return this.createService.create(organizationId, projectId, dto);
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

    let pending = getSemrushPending(job.seoCheckData);
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
      const message = resolveArticleJobErrorMessage(error, 'Semrush 检测失败');
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
            suppressFailureNotification: true,
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

    await this.billingService.assertArticleQuota(organizationId, 1);

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

    try {
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
    } catch (error) {
      await this.compensateEnqueueFailure(job.id, '入队失败，请稍后重试');
      throw error;
    }

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

  async retry(organizationId: string, projectId: string, id: string) {
    return this.createService.retry(organizationId, projectId, id);
  }

  /** 手动暂停进行中的任务（可从断点恢复）。 */
  async pause(
    organizationId: string,
    projectId: string,
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
    return this.lifecycleService.pause(organizationId, projectId, id, actorUserId, reason);
  }

  /** 恢复已暂停任务，从 pause 记录的步骤续跑。 */
  async resume(organizationId: string, projectId: string, id: string) {
    return this.lifecycleService.resume(organizationId, projectId, id);
  }

  async batchRetry(organizationId: string, projectId: string, jobIds: string[]) {
    return this.batchService.batchRetry(organizationId, projectId, jobIds);
  }

  /** 删除任务及队列、稿件插图等关联数据 */
  async remove(organizationId: string, projectId: string, id: string, traceId: string) {
    return this.lifecycleService.remove(organizationId, projectId, id, traceId);
  }

  async batchRemove(organizationId: string, projectId: string, jobIds: string[], traceId: string) {
    return this.batchService.batchRemove(organizationId, projectId, jobIds, traceId);
  }

  async cancel(
    organizationId: string,
    projectId: string,
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
    return this.lifecycleService.cancel(organizationId, projectId, id, actorUserId, reason);
  }

  async cancelSemrushCheck(organizationId: string, projectId: string, id: string) {
    return this.lifecycleService.cancelSemrushCheck(organizationId, projectId, id);
  }

  private async compensateEnqueueFailure(jobId: string, errorMessage: string): Promise<void> {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage },
    });
  }
}
