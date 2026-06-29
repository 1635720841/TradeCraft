/**
 * SEO 查分：Semrush RPA 调度与取消检测。
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import type { SeoCheckInput, SeoScore } from '@wm/provider-interfaces';
import type { LlmJobContext } from '../llm/llm.service';
import { SemrushQueueService } from '../../services/semrush-queue.service';
import { persistSemrushQueueCheckpoint } from '../../utils/semrush-queue-checkpoint.util';
import { isPlaywrightJobWaitTimeout } from '../../utils/semrush-queue-wait.util';
import { hashSemrushContent } from '../../providers/semrush/semrush-content-hash.util';
import { buildSemrushCheckInputFromContent } from '../../providers/semrush/semrush-submitted-keywords.util';
import {
  flowWordCount,
  logSeoPipelineFlow,
  summarizeFlowKeywords,
  type SemrushRpaFlowMeta,
} from '../../utils/seo-pipeline-flow-log.util';
import type { SemrushCheckPending, SemrushRpaInFlight } from '../../constants/semrush-check';
import { flowCtx } from './seo-checker-scoring.util';
import { SeoCheckerProgressService } from './seo-checker-progress.service';

@Injectable()
export class SeoCheckerRpaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semrushQueue: SemrushQueueService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly logger: LoggerService,
  ) {}

  async runSemrushCheck(
    input: SeoCheckInput,
    ctx: LlmJobContext,
    flowMeta?: SemrushRpaFlowMeta,
  ): Promise<SeoScore> {
    const resolved =
      input.submittedKeywords && input.submittedKeywords.length > 0
        ? input
        : buildSemrushCheckInputFromContent(
            input.content,
            input.keyword,
            input.recommendedKeywords ?? [],
          );

    const stickyNodeKey = input.preferredNodeKey?.trim() || undefined;
    if (stickyNodeKey) {
      (resolved as SeoCheckInput).preferredNodeKey = stickyNodeKey;
    }

    const rpaKind = flowMeta?.rpaKind ?? 'baseline';
    const flowStep =
      rpaKind === 'baseline'
        ? 'pipeline.semrush_baseline_rpa_start'
        : 'pipeline.semrush_rpa_recheck_start';
    logSeoPipelineFlow(this.logger, flowCtx(ctx), flowStep, {
      rpaKind,
      round: flowMeta?.round,
      rpaKeyword: resolved.keyword,
      submittedKeywords: summarizeFlowKeywords(resolved.submittedKeywords),
      submittedCount: resolved.submittedKeywords?.length ?? 0,
      recommendedKeywords: summarizeFlowKeywords(resolved.recommendedKeywords),
      poolKeywords: summarizeFlowKeywords(flowMeta?.poolKeywords),
      swaRecommended: summarizeFlowKeywords(flowMeta?.swaRecommended),
      swaMissing: summarizeFlowKeywords(flowMeta?.swaMissing),
      recheckDecision: flowMeta?.recheckDecision,
      wordCount: flowWordCount(resolved.content),
      preferredNodeKey: stickyNodeKey,
    });

    this.logger.info('Semrush RPA keyword plan', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.semrush_keyword_plan',
      submittedCount: resolved.submittedKeywords?.length ?? 0,
      submittedKeywords: resolved.submittedKeywords,
      rpaKind,
      round: flowMeta?.round,
    });

    await this.markSemrushRpaInFlight(ctx, {
      rpaKind,
      round: flowMeta?.round,
      contentHash: hashSemrushContent(resolved.content),
      submittedKeywords: resolved.submittedKeywords ?? [],
    });

    let result: SeoScore;
    let shouldClearRpaInFlight = true;
    try {
      result = await this.semrushQueue.runCheck(
        resolved,
        {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
        },
        {
          onEnqueued: async (bullJobId) => {
            await this.patchRpaBullJobId(ctx, bullJobId);
            const queueStatus = await this.semrushQueue.resolveJobQueueStatus(bullJobId);
            await this.progressService.touchWorkflowProgress(ctx, {
              phase: 'semrush-queue',
              message:
                queueStatus.waitingAhead != null && queueStatus.waitingAhead > 0
                  ? `Semrush 排队中，前面还有 ${queueStatus.waitingAhead} 个任务…`
                  : 'Semrush 排队中，请稍候…',
              waitingAhead: queueStatus.waitingAhead ?? undefined,
            });
          },
        },
      );

      await persistSemrushQueueCheckpoint(
        this.prisma,
        ctx.jobId,
        result,
        input.content,
        this.logger,
      );
    } catch (error) {
      if (isPlaywrightJobWaitTimeout(error)) {
        shouldClearRpaInFlight = false;
        this.logger.warn('Semrush RPA wait timed out while worker may still be active', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.semrush_rpa_wait_timeout_inflight_kept',
          rpaKind,
          round: flowMeta?.round,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    } finally {
      if (shouldClearRpaInFlight) {
        await this.clearSemrushRpaInFlight(ctx);
      }
    }

    const endStep =
      rpaKind === 'baseline'
        ? 'pipeline.semrush_baseline_rpa_end'
        : 'pipeline.semrush_rpa_recheck_end';
    logSeoPipelineFlow(this.logger, flowCtx(ctx), endStep, {
      rpaKind,
      round: flowMeta?.round,
      semrushScore: result.overall,
      skipped: result.skipped,
      node: result.node,
      readabilityScore: result.semrushReadabilityScore,
      missingRecommended: summarizeFlowKeywords(result.semrushMissingRecommendedKeywords),
      recommended: summarizeFlowKeywords(result.semrushRecommendedKeywords),
      competitorWordCount: result.semrushCompetitorWordCount,
      currentWordCount: result.semrushCurrentWordCount,
    });

    return result;
  }

  getSemrushPending(seoCheckData: unknown): SemrushCheckPending | null {
    const data = (seoCheckData ?? {}) as { semrush?: { pending?: SemrushCheckPending } };
    return data.semrush?.pending ?? null;
  }

  async markSemrushRpaInFlight(
    ctx: LlmJobContext,
    input: {
      rpaKind: string;
      round?: number;
      contentHash: string;
      submittedKeywords: string[];
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const rpaInFlight: SemrushRpaInFlight = {
      startedAt: new Date().toISOString(),
      rpaKind: input.rpaKind,
      contentHash: input.contentHash,
      submittedKeywords: input.submittedKeywords,
      ...(typeof input.round === 'number' ? { round: input.round } : {}),
    };

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        seoCheckData: {
          ...prevCheck,
          semrush: {
            ...prevSemrush,
            rpaInFlight,
          },
        } as object,
      },
    });
  }

  async patchRpaBullJobId(ctx: LlmJobContext, bullJobId: string): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const prevInFlight = (prevSemrush.rpaInFlight ?? {}) as SemrushRpaInFlight;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        seoCheckData: {
          ...prevCheck,
          semrush: {
            ...prevSemrush,
            rpaInFlight: {
              ...prevInFlight,
              bullJobId,
            },
          },
        } as object,
      },
    });
  }

  async clearSemrushRpaInFlight(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const { rpaInFlight: _rpaInFlight, ...semrushRest } = prevSemrush;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        seoCheckData: {
          ...prevCheck,
          semrush: semrushRest,
        } as object,
      },
    });
  }

  async assertSemrushWorkNotCancelled(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { status: true, seoCheckData: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在', { semrushAborted: true });
    }

    const data = (job.seoCheckData ?? {}) as { semrush?: { cancelled?: boolean } };
    if (data.semrush?.cancelled) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Semrush 检测已取消', {
        semrushAborted: true,
      });
    }

    if (job.status !== 'OPTIMIZING') {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '任务已不在优化中，停止 Semrush 后续步骤',
        { semrushAborted: true },
      );
    }
  }
}
