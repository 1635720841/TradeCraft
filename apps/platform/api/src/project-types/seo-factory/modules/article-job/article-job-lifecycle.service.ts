/**
 * 文章任务生命周期：暂停、恢复、删除与 Semrush 取消。
 *
 * 边界：
 * - 不负责：创建入队（ArticleJobService / ArticleJobQueueService）
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { softDeleteTimestamp } from '../../../../core/prisma/prisma-soft-delete.extension';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { StorageService } from '../../../../core/storage/storage.service';
import { MediaService } from '../../../../modules/media/media.service';
import { isBusyJobStatus, isCancellableJobStatus } from '../../constants/article-job-status';
import {
  getSemrushPending,
  shouldRecoverOrphanOptimizing,
} from '../../constants/semrush-check';
import {
  getWorkflowMeta,
  jobStatusForResumeStep,
  resolveResumeStep,
  withWorkflowMeta,
} from '../../constants/workflow-resume';
import { buildExportStoragePrefix } from '../export/export-html.util';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import {
  collectArticleImageAssetIds,
  reconcileArticleImagesFromContent,
  type ArticleImageRecord,
} from '../illustration/article-image.util';
import { CALIBRATION_LAB_JOB_ID_PREFIX } from '../../utils/score-calibration-manual-samples.util';
import { ArticleJobQueueService } from './article-job-queue.service';
import { buildArticleJobScraperOptions, getArticleJobConfig } from '../../constants/article-job-config';

@Injectable()
export class ArticleJobLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly queueService: ArticleJobQueueService,
    private readonly storage: StorageService,
    private readonly mediaService: MediaService,
  ) {}

  async pause(
    organizationId: string,
    projectId: string,
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
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

    if (job.status === JobStatus.PAUSED) {
      return {
        id: job.id,
        traceId: job.traceId,
        status: JobStatus.PAUSED,
        targetKeyword: job.targetKeyword,
      };
    }

    if (!isBusyJobStatus(job.status)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅进行中任务可暂停');
    }

    const semrushCtx = {
      jobId: id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };
    const pending = getSemrushPending(job.seoCheckData);
    if (pending) {
      await this.seoCheckerService.cancelManualSemrushCheck(
        semrushCtx,
        '任务已暂停，Semrush 检测已取消',
      );
    }

    const resumeFrom = resolveResumeStep({
      serpData: job.serpData,
      briefData: job.briefData,
      draftData: job.draftData,
      seoCheckData: job.seoCheckData,
      semrushScore: job.semrushScore,
    });
    const prevWorkflow = getWorkflowMeta(job.seoCheckData);
    let seoCheckData = withWorkflowMeta(job.seoCheckData, {
      ...prevWorkflow,
      failedStep: undefined,
      pausedStep: resumeFrom,
      pausedAt: new Date().toISOString(),
      pausedBy: actorUserId,
      pauseReason: reason?.trim() || undefined,
    });
    if (job.status === JobStatus.OPTIMIZING && !pending) {
      const prevSemrush = (seoCheckData.semrush ?? {}) as Record<string, unknown>;
      seoCheckData = {
        ...seoCheckData,
        semrush: {
          ...prevSemrush,
          cancelled: true,
          pauseCancelledAt: new Date().toISOString(),
        },
      };
    }

    await this.prisma.articleJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PAUSED,
        seoCheckData: seoCheckData as object,
      },
    });

    await this.seoCheckerService.abortInFlightSemrushWork(semrushCtx);
    await this.queueService.removeQueueJobsForArticleJob(job, organizationId, projectId);

    this.logger.info('Article job paused', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId: job.id,
      resumeFrom,
      actorUserId,
      action: 'article_job.pause',
    });

    return {
      id: job.id,
      traceId: job.traceId,
      status: JobStatus.PAUSED,
      targetKeyword: job.targetKeyword,
    };
  }

  /** 取消任务：清队列并标记 CANCELLED（不可恢复，区别于暂停） */
  async cancel(
    organizationId: string,
    projectId: string,
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
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

    if (job.status === JobStatus.CANCELLED) {
      return {
        id: job.id,
        traceId: job.traceId,
        status: JobStatus.CANCELLED,
        targetKeyword: job.targetKeyword,
      };
    }

    if (!isCancellableJobStatus(job.status)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '当前状态不可取消');
    }

    const semrushCtx = {
      jobId: id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };
    const pending = getSemrushPending(job.seoCheckData);
    if (pending) {
      await this.seoCheckerService.cancelManualSemrushCheck(
        semrushCtx,
        '任务已取消，Semrush 检测已终止',
      );
    }

    const prevWorkflow = getWorkflowMeta(job.seoCheckData);
    const seoCheckData = withWorkflowMeta(job.seoCheckData, {
      ...prevWorkflow,
      failedStep: undefined,
      pausedStep: undefined,
      pausedAt: undefined,
      pausedBy: undefined,
      pauseReason: undefined,
      cancelledAt: new Date().toISOString(),
      cancelledBy: actorUserId,
      cancelReason: reason?.trim() || undefined,
    });

    await this.prisma.articleJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.CANCELLED,
        errorMessage: null,
        seoCheckData: seoCheckData as object,
      },
    });

    await this.seoCheckerService.abortInFlightSemrushWork(semrushCtx);
    await this.queueService.removeQueueJobsForArticleJob(job, organizationId, projectId);

    this.logger.info('Article job cancelled', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId: job.id,
      previousStatus: job.status,
      actorUserId,
      action: 'article_job.cancel',
    });

    return {
      id: job.id,
      traceId: job.traceId,
      status: JobStatus.CANCELLED,
      targetKeyword: job.targetKeyword,
    };
  }

  async resume(organizationId: string, projectId: string, id: string) {
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

    if (job.status !== JobStatus.PAUSED) {
      if (isBusyJobStatus(job.status)) {
        return {
          id: job.id,
          traceId: job.traceId,
          status: job.status,
          targetKeyword: job.targetKeyword,
        };
      }
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅暂停任务可继续执行');
    }

    const workflowMeta = getWorkflowMeta(job.seoCheckData);
    const resumeFrom =
      workflowMeta.pausedStep ??
      resolveResumeStep({
        serpData: job.serpData,
        briefData: job.briefData,
        draftData: job.draftData,
        seoCheckData: job.seoCheckData,
        semrushScore: job.semrushScore,
      });
    const resumeTraceId = `tr_${uuidv4()}`;
    const resumeStatus = jobStatusForResumeStep(resumeFrom);
    let resumeSeoCheckData = withWorkflowMeta(job.seoCheckData, {
      failedStep: workflowMeta.failedStep,
      pausedStep: resumeFrom,
    });
    if (resumeFrom === 'optimizing' || resumeFrom === 'paraphrasing') {
      const prevSemrush = (resumeSeoCheckData.semrush ?? {}) as Record<string, unknown>;
      const { cancelled: _cancelled, pauseCancelledAt: _pauseCancelledAt, ...semrushRest } =
        prevSemrush;
      resumeSeoCheckData = { ...resumeSeoCheckData, semrush: semrushRest };
    }

    await this.prisma.articleJob.update({
      where: { id: job.id },
      data: {
        status: resumeStatus,
        traceId: resumeTraceId,
        errorMessage: null,
        seoCheckData: resumeSeoCheckData as object,
      },
    });

    await this.seoCheckerService.clearSemrushAbortSignal({
      jobId: job.id,
      traceId: resumeTraceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    });

    await this.queueService.removeQueueJobsForArticleJob(
      { id: job.id, traceId: job.traceId },
      organizationId,
      projectId,
    );

    try {
      await this.queueService.enqueueArticleJob(
        {
          jobId: job.id,
          traceId: resumeTraceId,
          organizationId,
          projectId,
          resumeFrom,
          scraperOptions: buildArticleJobScraperOptions(getArticleJobConfig(job.seoCheckData)),
        },
        `resume_${job.id}_${Date.now()}`,
      );
    } catch (error) {
      await this.prisma.articleJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, errorMessage: '恢复入队失败，请稍后重试' },
      });
      throw error;
    }

    this.logger.info('Article job resumed', {
      traceId: resumeTraceId,
      organizationId,
      projectId,
      jobId: job.id,
      resumeFrom,
      action: 'article_job.resume',
    });

    return {
      id: job.id,
      traceId: resumeTraceId,
      status: resumeStatus,
      targetKeyword: job.targetKeyword,
    };
  }

  async remove(organizationId: string, projectId: string, id: string, traceId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        targetKeyword: true,
        status: true,
        seoCheckData: true,
        draftData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.id.startsWith(CALIBRATION_LAB_JOB_ID_PREFIX)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '校准实验室样本请在校准页删除');
    }

    await this.cleanupBeforeDelete(organizationId, projectId, job);

    const deletedAt = softDeleteTimestamp();
    await this.prisma.articleJob.update({
      where: { id: job.id },
      data: { deletedAt },
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

    const pending = getSemrushPending(job.seoCheckData);
    const ctx = {
      jobId: id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };

    if (!pending) {
      if (job.status === JobStatus.OPTIMIZING) {
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

  private async cleanupBeforeDelete(
    organizationId: string,
    projectId: string,
    job: {
      id: string;
      traceId: string;
      targetKeyword: string;
      seoCheckData: unknown;
      draftData: unknown;
    },
  ): Promise<void> {
    const ctx = {
      jobId: job.id,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
    };

    const pending = getSemrushPending(job.seoCheckData);
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

    const draftData = (job.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
    };
    const images = reconcileArticleImagesFromContent(
      draftData.content ?? '',
      draftData.articleImages,
    );
    const assetIds = collectArticleImageAssetIds(images);
    if (assetIds.length > 0) {
      await this.mediaService.syncAssetBindings(organizationId, projectId, assetIds, []);
    }

    await this.queueService.removeQueueJobsForArticleJob(job, organizationId, projectId);
    await this.storage.deleteByPrefix(`${buildExportStoragePrefix(organizationId, projectId, job.id)}/`);
  }
}
