/**
 * SEO 查分：M6 初稿后流水线编排（本地优化 → Semrush 终检）。
 *
 * 边界：
 * - 不负责：各阶段具体逻辑（SeoCheckerLocalPipelineService / SeoCheckerSemrushPipelineService）
 *
 * 入口：
 * - SeoCheckerPipelineService
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import type { LlmJobContext } from '../llm/llm.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerLifecycleService } from './seo-checker-lifecycle.service';
import {
  resolveSiteSeoScoreConfig,
  hasExplicitSiteSeoScoreSettings,
} from '../../constants/site-seo-score-settings';
import {
  shouldSkipLocalOptimizationAligned,
} from '../../utils/score-calibration-local-align.util';
import { resolveOptimizeWordCountTarget } from '../llm/optimize-context.util';
import {
  canResumeSemrushOptimization,
  countOptimizeRounds,
  hasOptimizeBaseline,
  shouldForceLocalPipelineForWordGap,
  shouldSkipLocalPipeline,
} from '../../utils/seo-pipeline.util';
import { flowWordCount, logSeoPipelineFlow } from '../../utils/seo-pipeline-flow-log.util';
import type { CalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import type { OptimizeHistoryEntry, PersistedSeoCheckData, SerpOrganicRow } from './seo-checker.types';
import { evaluateLocal, flowCtx } from './seo-checker-scoring.util';
import { resolveJobLocalGate } from './seo-checker-gate.util';
import type { PostDraftPipelineSetup } from './seo-checker-pipeline.types';
import { SeoCheckerLocalPipelineService } from './seo-checker-local-pipeline.service';
import { SeoCheckerSemrushPipelineService } from './seo-checker-semrush-pipeline.service';
import { isSemrushWorkAbortedError } from './seo-checker-lifecycle.service';

@Injectable()
export class SeoCheckerPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly lifecycleService: SeoCheckerLifecycleService,
    private readonly localPipelineService: SeoCheckerLocalPipelineService,
    private readonly semrushPipelineService: SeoCheckerSemrushPipelineService,
  ) {}

  async runPostDraftPipeline(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        siteId: true,
        draftData: true,
        serpData: true,
        briefData: true,
        localSeoScore: true,
        semrushScore: true,
        seoCheckData: true,
        site: { select: { settings: true } },
      },
    });

    if (!job?.draftData) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿不存在，无法进行 SEO 评分');
    }

    const scoreConfig = resolveSiteSeoScoreConfig(job.site?.settings);
    const roundCapOptions = {
      strictCap: hasExplicitSiteSeoScoreSettings(job.site?.settings),
    };

    const draftData = job.draftData as {
      content?: string;
      title?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
    };
    const content = draftData.content ?? '';
    const articleTitle = draftData.title;
    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as {
      outline?: { targetWordCount?: number };
    } | null;
    const optimizeHistory = draftData.optimizeHistory ?? [];
    const seoCheck = (job.seoCheckData ?? {}) as PersistedSeoCheckData;
    const briefTargetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const semrushCompetitorWordCount = seoCheck.semrush?.semrushCompetitorWordCount;
    const targetWordCount = resolveOptimizeWordCountTarget(
      briefTargetWordCount,
      semrushCompetitorWordCount,
    );
    const localEvaluateHints = semrushCompetitorWordCount
      ? { competitorWordCount: semrushCompetitorWordCount }
      : undefined;
    const calibrationRuntime = await this.lifecycleService.loadCalibrationRuntime(ctx, job.siteId);
    const localGate = resolveJobLocalGate(job.site?.settings, calibrationRuntime, scoreConfig);
    const calibrationShadowLog: CalibrationShadowEntry[] = Array.isArray(
      (seoCheck as Record<string, unknown>).calibrationShadow,
    )
      ? ((seoCheck as Record<string, unknown>).calibrationShadow as CalibrationShadowEntry[])
      : [];

    const forceRerun = Boolean(seoCheck.optimizationRerun?.requestedAt);
    const localAlreadyPassed =
      !forceRerun &&
      shouldSkipLocalOptimizationAligned(job.localSeoScore, seoCheck, localGate);
    let semrushResumable = canResumeSemrushOptimization(
      job.semrushScore,
      seoCheck,
      optimizeHistory,
      scoreConfig,
    );
    if (
      forceRerun &&
      !semrushResumable &&
      job.semrushScore != null &&
      job.semrushScore < scoreConfig.semrushPassThreshold &&
      hasOptimizeBaseline(optimizeHistory, 'semrush')
    ) {
      semrushResumable = true;
    }
    const currentWordCount = flowWordCount(content);
    const forceLocalForWordGap = shouldForceLocalPipelineForWordGap({
      localAlreadyPassed,
      semrushResumable,
      wordCount: currentWordCount,
      targetWordCount,
    });
    const skipLocalPipeline =
      shouldSkipLocalPipeline(localAlreadyPassed, semrushResumable) && !forceLocalForWordGap;

    await this.progressService.touchWorkflowProgress(ctx, {
      phase: 'local-scoring',
      message: forceRerun
        ? '搜索表现偏弱，重新优化评分中…'
        : skipLocalPipeline
          ? semrushResumable
            ? `续跑 Semrush 优化（当前 ${job.semrushScore}/10，目标 ≥${scoreConfig.semrushPassThreshold}，本地分仅参考）…`
            : `本地预检已通过（${job.localSeoScore ?? seoCheck.local?.score ?? '—'} 分），进入 Semrush 终检…`
          : '正在计算本地预检分…',
    });
    const initialLocalResult = evaluateLocal(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
      localEvaluateHints,
    );

    logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.start', {
      targetKeyword: ctx.targetKeyword,
      localScore: initialLocalResult.score,
      semrushScore: job.semrushScore,
      forceRerun,
      skipLocalPipeline,
      localAlreadyPassed,
      semrushResumable,
      forceLocalForWordGap,
      localGateMode: localGate.mode,
      localGateThreshold: localGate.threshold,
      semrushPassThreshold: scoreConfig.semrushPassThreshold,
      localMaxOptimizeRounds: scoreConfig.localMaxOptimizeRounds,
      localRetryExtraRounds: scoreConfig.localRetryExtraRounds,
      semrushMaxOptimizeRounds: scoreConfig.semrushMaxOptimizeRounds,
      semrushRetryExtraRounds: scoreConfig.semrushRetryExtraRounds,
      strictRoundCap: roundCapOptions.strictCap,
      localOptimizeRoundsDone: countOptimizeRounds(optimizeHistory, 'local'),
      semrushOptimizeRoundsDone: countOptimizeRounds(optimizeHistory, 'semrush'),
      targetWordCount,
      competitorWordCount: semrushCompetitorWordCount,
      wordCount: currentWordCount,
    });

    const setup: PostDraftPipelineSetup = {
      scoreConfig,
      roundCapOptions,
      content,
      articleTitle,
      serpData,
      briefData,
      optimizeHistory,
      seoCheck,
      briefTargetWordCount,
      semrushCompetitorWordCount,
      targetWordCount,
      localEvaluateHints,
      calibrationRuntime,
      localGate,
      calibrationShadowLog,
      forceRerun,
      localAlreadyPassed,
      semrushResumable,
      forceLocalForWordGap,
      skipLocalPipeline,
    };

    const localResult = await this.localPipelineService.runLocalOptimization({
      ctx,
      job,
      setup,
      initialLocalResult,
    });

    try {
      await this.semrushPipelineService.runSemrushOptimization({
        ctx,
        job,
        setup,
        local: localResult,
      });
    } catch (error) {
      if (isSemrushWorkAbortedError(error)) {
        const row = await this.prisma.articleJob.findFirst({
          where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
          select: { status: true },
        });
        if (String(row?.status ?? '') === 'PAUSED') {
          this.logger.info('SEO pipeline stopped because job was paused during Semrush', {
            traceId: ctx.traceId,
            jobId: ctx.jobId,
            action: 'seo_checker.pipeline_paused_abort',
          });
          return;
        }
      }
      throw error;
    }
  }
}
