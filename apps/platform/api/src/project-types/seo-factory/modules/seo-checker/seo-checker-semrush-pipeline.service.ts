/**
 * SEO 查分流水线：Semrush 终检与优化轮次。
 *
 * 边界：
 * - 不负责：本地优化轮次（SeoCheckerLocalPipelineService）
 *
 * 入口：
 * - SeoCheckerSemrushPipelineService
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { LlmService } from '../llm/llm.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerRpaService } from './seo-checker-rpa.service';
import { SeoCheckerSemrushOptimizeService } from './seo-checker-semrush-optimize.service';
import { buildScoreThresholdsSnapshot } from '../../constants/site-seo-score-settings';
import { buildLocalGatePersistedFields } from '../../utils/score-calibration-local-align.util';
import {
  buildSemrushSubmittedKeywords,
  sanitizeSemrushSubmittedKeywords,
} from '../../providers/semrush/semrush-submitted-keywords.util';
import { enrichSemrushKeywordCoverage } from '../../providers/semrush/semrush-keyword-coverage.util';
import {
  countOptimizeRounds,
  hasOptimizeBaseline,
  resolveSemrushOptimizeRoundCap,
} from '../../utils/seo-pipeline.util';
import { flowWordCount, logSeoPipelineFlow } from '../../utils/seo-pipeline-flow-log.util';
import { appendCalibrationShadow, createCalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import type { SeoScore } from '@wm/provider-interfaces';
import {
  restoreSemrushResult,
  resolveFrozenLocalScoreFields,
  countSemrushMissingKeywords,
  flowCtx,
} from './seo-checker-scoring.util';
import { resolvePersistedSubmittedKeywords } from './seo-checker-keywords.util';
import {
  buildLocalGateEvaluation,
  buildPipelineContentScoreSnapshot,
  buildCalibrationPredictionForContent,
} from './seo-checker-gate.util';
import type { PostDraftSemrushPipelineInput } from './seo-checker-pipeline.types';

@Injectable()
export class SeoCheckerSemrushPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly logger: LoggerService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly rpaService: SeoCheckerRpaService,
    private readonly semrushOptimizeService: SeoCheckerSemrushOptimizeService,
  ) {}

  async runSemrushOptimization(input: PostDraftSemrushPipelineInput): Promise<void> {
    const { ctx, job, setup, local } = input;
    const {
      scoreConfig,
      roundCapOptions,
      serpData,
      optimizeHistory,
      seoCheck,
      targetWordCount,
      calibrationRuntime,
      localGate,
      semrushResumable,
    } = setup;
    const {
      currentContent: initialContent,
      localResult: initialLocalResult,
      optimizeRounds: localOptimizeRounds,
      finalGateEvaluation,
      recommendedKeywords,
    } = local;

    let currentContent = initialContent;
    let localResult = initialLocalResult;
    let optimizeRounds = localOptimizeRounds;
    const articleTitle = setup.articleTitle;
    const calibrationShadowLog = setup.calibrationShadowLog;
    const draftData = job.draftData as {
      content?: string;
      title?: string;
      optimizeHistory?: unknown[];
    };

    await this.progressService.touchWorkflowProgress(ctx, {
      phase: 'semrush-check',
      localScore: localResult.score,
      message: semrushResumable
        ? `续跑 Semrush 优化（当前 ${job.semrushScore}/10，目标 ≥${scoreConfig.semrushPassThreshold}）…`
        : localGate.mode === 'calibrated'
          ? `预测 Semrush ${finalGateEvaluation.prediction?.predictedSemrush ?? '—'}/10 已达标，Semrush 终检中（3ue RPA，约 2–5 分钟）…`
          : `本地预检 ${localResult.score} 分已通过，Semrush 终检中（3ue RPA，约 2–5 分钟）…`,
    });

    let semrushResult: SeoScore;
    let preferredNodeKey: string | undefined;
    if (semrushResumable) {
      semrushResult = restoreSemrushResult(seoCheck.semrush!, job.semrushScore!);
      preferredNodeKey = semrushResult.node?.trim() || undefined;
      const resumeSubmittedKeywords = sanitizeSemrushSubmittedKeywords(
        seoCheck.semrush?.submittedKeywords ??
          semrushResult.semrushTargetKeywords ??
          buildSemrushSubmittedKeywords(currentContent, {
            targetKeyword: ctx.targetKeyword,
            poolKeywords: recommendedKeywords,
          }),
      );
      semrushResult = enrichSemrushKeywordCoverage(semrushResult, currentContent, {
        submittedKeywords: resumeSubmittedKeywords,
        targetKeyword: ctx.targetKeyword,
      });
      this.logger.info('Resuming SEO pipeline: Semrush optimization from last checkpoint', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.resume_semrush',
        semrushScore: job.semrushScore,
        priorOptimizeRounds: countOptimizeRounds(optimizeHistory, 'semrush'),
      });
    } else {
      if (calibrationRuntime.shadowEnabled) {
        const prePrediction = buildCalibrationPredictionForContent(calibrationRuntime, {
          localResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: job.briefData,
          serpData,
          targetWordCount,
          poolKeywords: recommendedKeywords,
        });
        calibrationShadowLog.push(
          createCalibrationShadowEntry({
            phase: 'pre_rpa',
            localScore: localResult.score,
            prediction: prePrediction,
          }),
        );
        this.logger.info('Score calibration shadow pre-RPA', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.calibration_shadow',
          localScore: localResult.score,
          predictedSemrush: prePrediction.predictedSemrush,
          confidence: prePrediction.confidence,
        });
      }

      semrushResult = await this.rpaService.runSemrushCheck(
        {
          content: currentContent,
          keyword: ctx.targetKeyword,
          recommendedKeywords,
        },
        ctx,
        { rpaKind: 'baseline' },
      );
      preferredNodeKey = semrushResult.node?.trim() || undefined;

      if (calibrationRuntime.shadowEnabled && !semrushResult.skipped) {
        const postPrediction = buildCalibrationPredictionForContent(calibrationRuntime, {
          localResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: job.briefData,
          serpData,
          targetWordCount,
          semrushResult,
          poolKeywords: recommendedKeywords,
        });
        calibrationShadowLog.push(
          createCalibrationShadowEntry({
            phase: 'post_rpa',
            localScore: localResult.score,
            prediction: postPrediction,
            actualSemrush: semrushResult.overall,
          }),
        );
        this.logger.info('Score calibration shadow post-RPA', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.calibration_shadow',
          predictedSemrush: postPrediction.predictedSemrush,
          actualSemrush: semrushResult.overall,
          absError:
            Math.round(Math.abs(postPrediction.predictedSemrush - semrushResult.overall) * 100) /
            100,
        });
      }

      if (!semrushResult.skipped && !hasOptimizeBaseline(optimizeHistory, 'semrush')) {
        await this.llmService.recordOptimizeSnapshot(ctx, {
          phase: 'semrush',
          round: 0,
          kind: 'baseline',
          semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
          scoreAfter: semrushResult.overall,
          localScoreAfter: localResult.score,
          optimizedAt: new Date().toISOString(),
        });
      }

      if (!semrushResult.skipped && semrushResult.calibrationProxy !== true) {
        await this.progressService.appendSemrushRpaSnapshot(ctx, {
          content: currentContent,
          targetKeyword: ctx.targetKeyword,
          recommendedKeywords,
          semrushResult,
          localResult,
          round: countOptimizeRounds(optimizeHistory, 'semrush'),
        });
      }
    }

    let semrushOptimizeRounds = countOptimizeRounds(optimizeHistory, 'semrush');
    const isSemrushResume = semrushResumable && semrushOptimizeRounds > 0;
    const semrushRoundCap = resolveSemrushOptimizeRoundCap(
      semrushResult.overall,
      semrushOptimizeRounds,
      isSemrushResume,
      scoreConfig,
      roundCapOptions,
    );

    const optimized = await this.semrushOptimizeService.executeSemrushOptimizeRounds(ctx, {
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      initialContent: currentContent,
      initialLocalResult: localResult,
      initialSemrushResult: semrushResult,
      seoCheck,
      recommendedKeywords,
      optimizeHistory,
      semrushOptimizeRounds,
      semrushRoundCap,
      localOptimizeRounds: optimizeRounds,
      preferredNodeKey,
      calibrationRuntime,
      localGate,
      calibrationShadowLog,
      scoreConfig,
      roundCapOptions,
    });
    currentContent = optimized.content;
    localResult = optimized.localResult;
    semrushResult = optimized.semrushResult;
    semrushOptimizeRounds = optimized.semrushOptimizeRounds;
    calibrationShadowLog.splice(
      0,
      calibrationShadowLog.length,
      ...optimized.calibrationShadowLog,
    );

    currentContent = await this.progressService.reconcileDraftEnrichments(ctx, currentContent);

    const latestJob = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const latestDraft = (latestJob?.draftData ?? draftData) as {
      content?: string;
      optimizeHistory?: unknown[];
    };
    const prevCheck = (latestJob?.seoCheckData ?? {}) as Record<string, unknown>;

    const submittedKeywordsFinal = resolvePersistedSubmittedKeywords(
      currentContent,
      ctx.targetKeyword,
      recommendedKeywords,
      semrushResult,
    );
    const persistedLocalGate = buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: currentContent,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      articleTitle,
      poolKeywords: recommendedKeywords,
      submittedKeywords: submittedKeywordsFinal,
      semrushResult,
    });
    const frozenLocal = resolveFrozenLocalScoreFields(prevCheck.local, localResult);
    const persistedLocalFields = buildLocalGatePersistedFields({
      gate: localGate,
      localScore: frozenLocal.score,
      prediction: persistedLocalGate.prediction,
    });
    const contentScoreSnapshot = buildPipelineContentScoreSnapshot({
      ctx,
      content: currentContent,
      localResult,
      semrushResult,
      calibrationRuntime,
      targetWordCount,
      submittedKeywords: submittedKeywordsFinal,
      missingKeywordCount: countSemrushMissingKeywords(
        currentContent,
        ctx.targetKeyword,
        semrushResult,
        recommendedKeywords,
        submittedKeywordsFinal,
      ),
    });
    contentScoreSnapshot.localScore = frozenLocal.score;

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: null,
      contentScore: contentScoreSnapshot,
      local: {
        score: frozenLocal.score,
        breakdown: frozenLocal.breakdown,
        suggestions: frozenLocal.suggestions,
        metrics: frozenLocal.metrics,
        optimizeRounds,
        ...persistedLocalFields,
        passedAt: new Date().toISOString(),
      },
      semrush: semrushResult.skipped
        ? { skipped: true, suggestions: semrushResult.suggestions }
        : {
            overall: semrushResult.overall,
            suggestions: semrushResult.suggestions,
            passed: semrushResult.overall >= scoreConfig.semrushPassThreshold,
            node: semrushResult.node,
            nodeLabel: semrushResult.nodeLabel,
            suggestionDetails: semrushResult.suggestionDetails,
            actionableIssues: semrushResult.actionableIssues,
            analysisSource: semrushResult.analysisSource,
            apiUrls: semrushResult.apiUrls,
            optimizeRounds: semrushOptimizeRounds,
            submittedKeywords: submittedKeywordsFinal,
            semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
            semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
            semrushReadabilityScore: semrushResult.semrushReadabilityScore,
            semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
            semrushEvaluationContentFingerprint:
              semrushResult.semrushEvaluationContentFingerprint,
            semrushTargetKeywords: semrushResult.semrushTargetKeywords,
            semrushRecommendedKeywords: semrushResult.semrushRecommendedKeywords,
            semrushMissingTargetKeywords: semrushResult.semrushMissingTargetKeywords,
            semrushMissingRecommendedKeywords: semrushResult.semrushMissingRecommendedKeywords,
            semrushCheckRecord: semrushResult.semrushCheckRecord,
          },
      optimizeHistory: latestDraft.optimizeHistory ?? [],
      scoreThresholds: buildScoreThresholdsSnapshot(scoreConfig),
    };

    let seoCheckWithShadow: Record<string, unknown> = seoCheckBase;
    for (const entry of calibrationShadowLog) {
      seoCheckWithShadow = appendCalibrationShadow(seoCheckWithShadow, entry);
    }
    seoCheckWithShadow.calibration = {
      shadowEnabled: calibrationRuntime.shadowEnabled,
      reduceRpaEnabled: calibrationRuntime.reduceRpaEnabled,
      modelSampleCount: calibrationRuntime.model?.sampleCount ?? 0,
      modelMae: calibrationRuntime.model?.holdoutMae ?? null,
      modelTrainMae: calibrationRuntime.model?.mae ?? null,
      proxyUsed: semrushResult.calibrationProxy === true,
      rpaSkippedCount: calibrationShadowLog.filter((entry) => entry.rpaSkipped).length,
    };

    const seoCheckData = seoCheckWithShadow;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: frozenLocal.score,
        seoCheckData: seoCheckData as object,
        semrushScore: semrushResult.skipped ? null : semrushResult.overall,
        draftData: { ...latestDraft, content: currentContent } as object,
      },
    });

    if (!semrushResult.skipped && semrushResult.overall < scoreConfig.semrushPassThreshold) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `Semrush 评分 ${semrushResult.overall}，未达 ${scoreConfig.semrushPassThreshold} 分：${semrushResult.suggestions.join('；')}`,
      );
    }

    this.logger.info('SEO check pipeline completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.completed',
      localScore: frozenLocal.score,
      semrushScore: semrushResult.skipped ? null : semrushResult.overall,
      optimizeRounds,
      semrushOptimizeRounds,
    });
    logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.completed', {
      localScore: frozenLocal.score,
      semrushScore: semrushResult.skipped ? null : semrushResult.overall,
      localOptimizeRounds: optimizeRounds,
      semrushOptimizeRounds,
      wordCount: flowWordCount(currentContent),
      semrushPassed:
        !semrushResult.skipped && semrushResult.overall >= scoreConfig.semrushPassThreshold,
    });
  }
}
