/**
 * SEO 查分：M6 初稿后流水线（本地优化 → Semrush 终检）。
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import type { LlmJobContext } from '../llm/llm.service';
import { LlmService } from '../llm/llm.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerRpaService } from './seo-checker-rpa.service';
import { SeoCheckerSemrushOptimizeService } from './seo-checker-semrush-optimize.service';
import { SeoCheckerLifecycleService } from './seo-checker-lifecycle.service';
import {
  resolveSiteSeoScoreConfig,
  hasExplicitSiteSeoScoreSettings,
  buildScoreThresholdsSnapshot,
} from '../../constants/site-seo-score-settings';
import {
  isLocalGateNearMiss,
  isLocalGateSoftPass,
  shouldAcceptLocalGateCandidate,
  shouldDeferCalibratedGateToSemrushRpa,
  shouldSkipLocalOptimizationAligned,
  buildLocalGatePersistedFields,
  resolveLocalGateRoundCap,
} from '../../utils/score-calibration-local-align.util';
import { resolveOptimizeWordCountTarget } from '../llm/optimize-context.util';
import { formatFocusDimensions } from '../llm/optimize-history-context.util';
import {
  buildSemrushSubmittedKeywords,
  sanitizeSemrushSubmittedKeywords,
} from '../../providers/semrush/semrush-submitted-keywords.util';
import { enrichSemrushKeywordCoverage, buildContextualKeywordWeavingInstruction } from '../../providers/semrush/semrush-keyword-coverage.util';
import {
  canResumeSemrushOptimization,
  countOptimizeRounds,
  hasOptimizeBaseline,
  resolveSemrushOptimizeRoundCap,
  shouldForceLocalPipelineForWordGap,
  shouldSkipLocalPipeline,
} from '../../utils/seo-pipeline.util';
import { flowWordCount, logSeoPipelineFlow, summarizeFlowKeywords } from '../../utils/seo-pipeline-flow-log.util';
import { appendCalibrationShadow, createCalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import type { CalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import type { OptimizeHistoryEntry, PersistedSeoCheckData, SerpOrganicRow } from './seo-checker.types';
import type { SeoScore } from '@wm/provider-interfaces';
import { LOCAL_SEO_NEAR_MISS_MARGIN } from '../../constants/seo-score';
import {
  boostLocalSeoContent,
  applyFleschTowardSemrushTarget,
  applyKeywordDensityNudge,
  applySemrushDefaultComplexWordFixes,
  applySemrushHardToReadDeterministicFixes,
  isFleschProgressTowardTarget,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
} from '@wm/shared-core';
import {
  evaluateLocal,
  formatLocalScoreBreakdown,
  collectProtectedSeoPhrases,
  countSemrushMissingKeywords,
  flowCtx,
  restoreSemrushResult,
} from './seo-checker-scoring.util';
import { mergeRecommendedKeywordsForWriting, resolvePersistedSubmittedKeywords } from './seo-checker-keywords.util';
import {
  resolveJobLocalGate,
  buildLocalGateEvaluation,
  buildPipelineContentScoreSnapshot,
  applyCalibratedFinalGateBoost,
  applyDeterministicLocalBoost,
  buildCalibrationPredictionForContent,
} from './seo-checker-gate.util';
import { buildLocalOptimizeContext } from './seo-checker-local-context.util';

@Injectable()
export class SeoCheckerPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly logger: LoggerService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly rpaService: SeoCheckerRpaService,
    private readonly semrushOptimizeService: SeoCheckerSemrushOptimizeService,
    private readonly lifecycleService: SeoCheckerLifecycleService,
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

    let currentContent = content;
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
    let localResult = evaluateLocal(
      ctx.targetKeyword,
      currentContent,
      serpData,
      targetWordCount,
      localEvaluateHints,
    );
    let optimizeRounds = countOptimizeRounds(optimizeHistory, 'local');

    logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.start', {
      targetKeyword: ctx.targetKeyword,
      localScore: localResult.score,
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
      localOptimizeRoundsDone: optimizeRounds,
      semrushOptimizeRoundsDone: countOptimizeRounds(optimizeHistory, 'semrush'),
      targetWordCount,
      competitorWordCount: semrushCompetitorWordCount,
      wordCount: flowWordCount(currentContent),
    });

    if (!skipLocalPipeline) {
      const initialBoost = applyDeterministicLocalBoost(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
        localResult.score,
        scoreConfig,
      );
      if (initialBoost.applied) {
        currentContent = initialBoost.content;
        localResult = initialBoost.result;
        this.logger.info('Deterministic local SEO boost applied before optimize loop', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.local_deterministic_boost',
          scoreAfter: localResult.score,
        });
      }
    }

    if (!skipLocalPipeline) {
      let bestLocalScore = localResult.score;
      let bestLocalContent = currentContent;
      let bestLocalResult = localResult;
      let gateEvaluation = buildLocalGateEvaluation(calibrationRuntime, localGate, {
        localResult,
        targetKeyword: ctx.targetKeyword,
        content: currentContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        articleTitle,
        poolKeywords: mergeRecommendedKeywordsForWriting(
          job.briefData,
          localResult.recommendedKeywords,
          ctx.targetKeyword,
        ),
      });

      if (!hasOptimizeBaseline(optimizeHistory, 'local')) {
        await this.llmService.recordOptimizeSnapshot(ctx, {
          phase: 'local',
          round: 0,
          kind: 'baseline',
          scoreAfter: localResult.score,
          breakdownAfter: localResult.breakdown,
          predictedSemrushAfter:
            localGate.mode === 'calibrated'
              ? gateEvaluation.prediction?.predictedSemrush
              : undefined,
          optimizedAt: new Date().toISOString(),
        });
      }
      let bestGateScore = gateEvaluation.gateScore;
      let bestPredictedSemrush = gateEvaluation.prediction?.predictedSemrush ?? 0;
      const isLocalResume = optimizeRounds > 0;
      const localRoundCap = resolveLocalGateRoundCap({
        gate: localGate,
        bestGateScore,
        completedRounds: optimizeRounds,
        isLocalResume,
        scoreConfig,
        strictCap: roundCapOptions.strictCap,
      });

      while (!gateEvaluation.passed && optimizeRounds < localRoundCap) {
      optimizeRounds += 1;
      const pointsToGo = gateEvaluation.pointsToGo;
      const gateTargetLabel =
        localGate.mode === 'calibrated'
          ? `预测 Semrush ≥${localGate.threshold}`
          : `≥${localGate.threshold} 分`;
      await this.progressService.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: localRoundCap,
        localScore: localResult.score,
        message:
          localGate.mode === 'calibrated'
            ? `预测 Semrush ${gateEvaluation.prediction?.predictedSemrush ?? '—'}/10，${pointsToGo > 0 ? `差 ${pointsToGo} 分达标` : '优化中'}（第 ${optimizeRounds}/${localRoundCap} 轮，目标 ${gateTargetLabel}）…`
            : pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN
              ? `本地预检 ${localResult.score} 分（差 ${pointsToGo} 分达标，目标 ${gateTargetLabel}），按建议定向改写中（第 ${optimizeRounds}/${localRoundCap} 轮）…`
              : `本地预检 ${localResult.score} 分，AI 优化中（第 ${optimizeRounds}/${localRoundCap} 轮，目标 ${gateTargetLabel}，约 1–3 分钟）…`,
      });
      const keywordsForAi = mergeRecommendedKeywordsForWriting(
        job.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
        undefined,
        { content: currentContent },
      );
      logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.local_round_start', {
        round: optimizeRounds,
        maxRounds: localRoundCap,
        localScore: localResult.score,
        gateMode: localGate.mode,
        pointsToGo,
        predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
        recommendedKeywords: summarizeFlowKeywords(keywordsForAi),
        recommendedKeywordCount: keywordsForAi.length,
        missingSerpKeywords: summarizeFlowKeywords(localResult.recommendedKeywords),
        wordCount: flowWordCount(currentContent),
      });
      this.logger.info('Local SEO below threshold, optimizing draft', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.local_optimize',
        round: optimizeRounds,
        score: localResult.score,
        recommendedKeywordCount: keywordsForAi.length,
      });

      const localOptCtx = buildLocalOptimizeContext(
        localResult,
        currentContent,
        scoreConfig,
        localGate,
        gateEvaluation.prediction,
        {
          targetKeyword: ctx.targetKeyword,
          articleTitle,
          targetWordCount: briefTargetWordCount,
          competitorWordCount: semrushCompetitorWordCount,
          semrushCurrentWordCount: seoCheck.semrush?.semrushCurrentWordCount,
        },
      );
      if (pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN) {
        const densityNudged = applyKeywordDensityNudge(ctx.targetKeyword, currentContent);
        if (densityNudged !== currentContent) {
          const nudgedResult = evaluateLocal(
            ctx.targetKeyword,
            densityNudged,
            serpData,
            targetWordCount,
          );
          if (nudgedResult.score >= localResult.score) {
            currentContent = densityNudged;
            localResult = nudgedResult;
            if (nudgedResult.score > bestLocalScore) {
              bestLocalScore = nudgedResult.score;
              bestLocalContent = densityNudged;
              bestLocalResult = nudgedResult;
            }
          }
        }
        const complexFixed = applySemrushDefaultComplexWordFixes(currentContent);
        if (complexFixed !== currentContent) {
          const fixedResult = evaluateLocal(
            ctx.targetKeyword,
            complexFixed,
            serpData,
            targetWordCount,
          );
          if (fixedResult.score >= localResult.score) {
            currentContent = complexFixed;
            localResult = fixedResult;
            if (fixedResult.score > bestLocalScore) {
              bestLocalScore = fixedResult.score;
              bestLocalContent = complexFixed;
              bestLocalResult = fixedResult;
            }
          }
        }
      }
      if (localGate.mode === 'calibrated') {
        const fleschFixed = applyFleschTowardSemrushTarget(currentContent, SEMRUSH_FLESCH_TARGET_DEFAULT);
        if (fleschFixed !== currentContent) {
          const fleschResult = evaluateLocal(
            ctx.targetKeyword,
            fleschFixed,
            serpData,
            targetWordCount,
          );
          const fleschGate = buildLocalGateEvaluation(calibrationRuntime, localGate, {
            localResult: fleschResult,
            targetKeyword: ctx.targetKeyword,
            content: fleschFixed,
            jobBriefData: job.briefData,
            serpData,
            targetWordCount,
            articleTitle,
            poolKeywords: keywordsForAi,
          });
          const fleschBefore = localResult.metrics.fleschReadingEase ?? 0;
          const fleschAfter = fleschResult.metrics.fleschReadingEase ?? 0;
          const fleschProgress = isFleschProgressTowardTarget({
            before: fleschBefore,
            after: fleschAfter,
            target: SEMRUSH_FLESCH_TARGET_DEFAULT,
          });
          if (
            fleschGate.gateScore >= bestGateScore - 0.05 ||
            fleschProgress
          ) {
            currentContent = fleschFixed;
            localResult = fleschResult;
            gateEvaluation = fleschGate;
            if (fleschGate.gateScore > bestGateScore) {
              bestGateScore = fleschGate.gateScore;
              bestPredictedSemrush =
                fleschGate.prediction?.predictedSemrush ?? bestPredictedSemrush;
            }
            if (fleschProgress || fleschResult.score >= bestLocalScore) {
              bestLocalScore = Math.max(bestLocalScore, fleschResult.score);
              bestLocalContent = fleschFixed;
              bestLocalResult = fleschResult;
            }
          }
        }
      }
      if (localOptCtx.hardSentencePriority) {
        const hardFixed = applySemrushHardToReadDeterministicFixes(currentContent);
        if (hardFixed !== currentContent) {
          const hardResult = evaluateLocal(
            ctx.targetKeyword,
            hardFixed,
            serpData,
            targetWordCount,
          );
          const hardGate = buildLocalGateEvaluation(calibrationRuntime, localGate, {
            localResult: hardResult,
            targetKeyword: ctx.targetKeyword,
            content: hardFixed,
            jobBriefData: job.briefData,
            serpData,
            targetWordCount,
            articleTitle,
            poolKeywords: keywordsForAi,
          });
          const hardHits = hardResult.metrics.hardToReadSentenceHits ?? 0;
          const prevHits = localResult.metrics.hardToReadSentenceHits ?? 0;
          if (
            hardHits < prevHits ||
            (hardResult.score >= localResult.score && hardGate.gateScore >= gateEvaluation.gateScore)
          ) {
            currentContent = hardFixed;
            localResult = hardResult;
            gateEvaluation = hardGate;
            if (hardGate.gateScore > bestGateScore) {
              bestGateScore = hardGate.gateScore;
              bestPredictedSemrush =
                hardGate.prediction?.predictedSemrush ?? bestPredictedSemrush;
            }
            if (hardResult.score >= bestLocalScore || hardHits < (bestLocalResult.metrics.hardToReadSentenceHits ?? 99)) {
              bestLocalScore = Math.max(bestLocalScore, hardResult.score);
              bestLocalContent = hardFixed;
              bestLocalResult = hardResult;
            }
          }
        }
      }

      const localSuggestions = [...localOptCtx.suggestions];
      if (localResult.recommendedKeywords.length > 0 && !localOptCtx.serpCoverageMaxed) {
        const weaving = buildContextualKeywordWeavingInstruction(
          localResult.recommendedKeywords,
        );
        if (weaving) localSuggestions.unshift(weaving);
      }

      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        localSuggestions,
        keywordsForAi,
        {
          phase: 'local',
          round: optimizeRounds,
          scoreBefore: localResult.score,
          localScore: localResult.score,
          localScoreTarget: scoreConfig.localPassThreshold,
          calibratedLocalAlign: localGate.mode === 'calibrated',
          predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
          predictedSemrushTarget:
            localGate.mode === 'calibrated' ? localGate.threshold : undefined,
          localScoreBreakdown: formatLocalScoreBreakdown(localResult),
          focusDimensions: formatFocusDimensions(localResult.breakdown),
          readabilityPriority: localOptCtx.readabilityPriority,
          serpPriority: localOptCtx.serpPriority,
          fleschPriority: localOptCtx.fleschPriority,
          hardSentencePriority: localOptCtx.hardSentencePriority,
          titlePriority: localOptCtx.titlePriority,
          wordCountTrimPriority: localOptCtx.wordCountTrimPriority,
          wordCountExpandPriority: localOptCtx.wordCountExpandPriority,
          articleTitle: localOptCtx.resolvedTitle,
          semrushCurrentWordCount: localResult.metrics.wordCount,
          semrushCompetitorWordCount: semrushCompetitorWordCount ?? undefined,
          readabilityAudit: localOptCtx.readabilityAudit,
          pointsToGo: localOptCtx.pointsToGo,
          scoreGapPlan: localOptCtx.scoreGapPlan,
          contentCoverageMaxed: localOptCtx.contentCoverageMaxed,
          serpCoverageMaxed: localOptCtx.serpCoverageMaxed,
          keywordDensityFocus: localOptCtx.keywordDensityFocus,
          protectedSeoPhrases: collectProtectedSeoPhrases(
            currentContent,
            ctx.targetKeyword,
            keywordsForAi,
          ),
        },
      );
      currentContent = boostLocalSeoContent(currentContent, { targetWordCount });
      const candidateResult = evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
      );
      const candidateGateEvaluation = buildLocalGateEvaluation(
        calibrationRuntime,
        localGate,
        {
          localResult: candidateResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: job.briefData,
          serpData,
          targetWordCount,
          articleTitle,
          poolKeywords: keywordsForAi,
        },
      );
      const nearMiss = isLocalGateNearMiss({ gate: localGate, bestGateScore });
      const longSentencesImproved =
        candidateResult.metrics.longSentencesOver22 <= 2 &&
        candidateResult.metrics.longSentencesOver22 <
          (bestLocalResult.metrics.longSentencesOver22 ?? Number.MAX_SAFE_INTEGER);
      const longParagraphsImproved =
        candidateResult.metrics.longParagraphsOver65 <= 1 &&
        candidateResult.metrics.longParagraphsOver65 <
          (bestLocalResult.metrics.longParagraphsOver65 ?? Number.MAX_SAFE_INTEGER);
      const complexWordsImproved =
        (candidateResult.metrics.semrushComplexWordHits ?? 0) <
        (bestLocalResult.metrics.semrushComplexWordHits ?? Number.MAX_SAFE_INTEGER);
      const hardSentencesImproved =
        (candidateResult.metrics.hardToReadSentenceHits ?? 0) <
        (bestLocalResult.metrics.hardToReadSentenceHits ?? Number.MAX_SAFE_INTEGER);
      const readabilityImproved =
        longSentencesImproved ||
        longParagraphsImproved ||
        complexWordsImproved ||
        hardSentencesImproved;
      const improved = shouldAcceptLocalGateCandidate({
        gate: localGate,
        candidateLocalScore: candidateResult.score,
        bestLocalScore,
        candidatePredicted: candidateGateEvaluation.gateScore,
        bestPredicted: bestPredictedSemrush,
        candidateKeywordCoverage: candidateResult.breakdown.keywordCoverage,
        bestKeywordCoverage: bestLocalResult.breakdown.keywordCoverage,
        nearMiss,
        readabilityImproved,
        candidateFlesch: candidateResult.metrics.fleschReadingEase,
        bestFlesch: bestLocalResult.metrics.fleschReadingEase,
        candidateSerpAlignment: candidateResult.breakdown.serpTermAlignment,
        bestSerpAlignment: bestLocalResult.breakdown.serpTermAlignment,
        candidateHardSentenceHits: candidateResult.metrics.hardToReadSentenceHits,
        bestHardSentenceHits: bestLocalResult.metrics.hardToReadSentenceHits,
      });
      if (improved) {
        bestLocalScore = candidateResult.score;
        bestLocalContent = currentContent;
        bestLocalResult = candidateResult;
        localResult = candidateResult;
        bestGateScore = candidateGateEvaluation.gateScore;
        bestPredictedSemrush = candidateGateEvaluation.prediction?.predictedSemrush ?? bestPredictedSemrush;
        gateEvaluation = candidateGateEvaluation;
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.local_round_end', {
          round: optimizeRounds,
          accepted: true,
          localScore: localResult.score,
          predictedSemrush: candidateGateEvaluation.prediction?.predictedSemrush,
          wordCount: flowWordCount(currentContent),
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          {
            scoreAfter: localResult.score,
            breakdownAfter: localResult.breakdown,
            predictedSemrushAfter:
              localGate.mode === 'calibrated'
                ? candidateGateEvaluation.prediction?.predictedSemrush
                : undefined,
          },
        );
      } else {
        await this.llmService.revertDraftContent(ctx, bestLocalContent);
        currentContent = bestLocalContent;
        localResult = bestLocalResult;
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.local_round_end', {
          round: optimizeRounds,
          accepted: false,
          rolledBack: true,
          candidateScore: candidateResult.score,
          bestScore: bestLocalScore,
          wordCount: flowWordCount(bestLocalContent),
        });
        this.logger.warn('Local optimize rolled back to best version', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.local_optimize_rollback',
          round: optimizeRounds,
          candidateScore: candidateResult.score,
          bestScore: bestLocalScore,
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          {
            scoreAfter: bestLocalScore,
            breakdownAfter: bestLocalResult.breakdown,
            rolledBack: true,
            candidateScoreAfter: candidateResult.score,
            predictedSemrushAfter:
              localGate.mode === 'calibrated' ? bestPredictedSemrush : undefined,
            candidatePredictedSemrush:
              localGate.mode === 'calibrated'
                ? candidateGateEvaluation.prediction?.predictedSemrush
                : undefined,
            rollbackReason:
              candidateResult.breakdown.keywordCoverage <
              bestLocalResult.breakdown.keywordCoverage
                ? 'keyword_coverage_regressed'
                : localGate.mode === 'calibrated'
                  ? 'predicted_semrush_regressed'
                  : 'score_regressed',
          },
        );
      }
      gateEvaluation = buildLocalGateEvaluation(calibrationRuntime, localGate, {
        localResult: bestLocalResult,
        targetKeyword: ctx.targetKeyword,
        content: bestLocalContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        articleTitle,
        poolKeywords: mergeRecommendedKeywordsForWriting(
          job.briefData,
          bestLocalResult.recommendedKeywords,
          ctx.targetKeyword,
        ),
      });
      await this.progressService.persistLocalSeoProgress(ctx, {
        localResult: bestLocalResult,
        optimizeRounds,
        content: bestLocalContent,
        passed: gateEvaluation.passed,
        predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
        gateMode: localGate.mode,
        existingSeoCheck: seoCheck,
      });
      }

      const finalBoost = applyDeterministicLocalBoost(
        ctx.targetKeyword,
        bestLocalContent,
        serpData,
        targetWordCount,
        bestLocalScore,
      );
      if (finalBoost.applied && finalBoost.result.score >= bestLocalScore) {
        bestLocalContent = finalBoost.content;
        bestLocalResult = finalBoost.result;
        bestLocalScore = finalBoost.result.score;
        localResult = finalBoost.result;
        this.logger.info('Deterministic local SEO boost applied after optimize loop', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.local_deterministic_boost_final',
          scoreAfter: finalBoost.result.score,
        });
      }

      currentContent = bestLocalContent;
      localResult = bestLocalResult;
    } else {
      logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.local_skip', {
        localScore: job.localSeoScore ?? localResult.score,
        semrushResumable,
      });
      this.logger.info('Resuming SEO pipeline: local pre-check already passed', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.resume_local_skipped',
        localScore: job.localSeoScore ?? localResult.score,
      });
    }

    if (forceRerun) {
      const preForceGate = buildLocalGateEvaluation(calibrationRuntime, localGate, {
        localResult,
        targetKeyword: ctx.targetKeyword,
        content: currentContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        articleTitle,
      });
      if (preForceGate.passed) {
      const refreshed = await this.lifecycleService.runForcedLocalRefresh(ctx, {
        briefData: job.briefData,
        currentContent,
        localResult,
        serpData,
        targetWordCount,
        optimizeRounds,
        reason: seoCheck.optimizationRerun?.reason,
        scoreConfig,
        siteSettings: job.site?.settings,
        calibrationRuntime,
        articleTitle,
      });
      currentContent = refreshed.content;
      localResult = refreshed.localResult;
      optimizeRounds = refreshed.optimizeRounds;
      }
    }

    currentContent = await this.progressService.reconcileDraftEnrichments(ctx, currentContent);
    if (localGate.mode === 'calibrated' && !skipLocalPipeline) {
      const calibratedBoost = applyCalibratedFinalGateBoost(
        calibrationRuntime,
        localGate,
        {
          keyword: ctx.targetKeyword,
          content: currentContent,
          serpData,
          targetWordCount,
          jobBriefData: job.briefData,
          poolKeywords: mergeRecommendedKeywordsForWriting(
            job.briefData,
            localResult.recommendedKeywords,
            ctx.targetKeyword,
          ),
          baselineResult: localResult,
          articleTitle,
        },
      );
      if (calibratedBoost.applied) {
        currentContent = calibratedBoost.content;
        localResult = calibratedBoost.result;
        this.logger.info('Calibrated final gate boost applied before Semrush RPA', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.calibrated_final_gate_boost',
          predictedSemrush: calibratedBoost.predictedSemrush,
          localScore: localResult.score,
          flesch: localResult.metrics.fleschReadingEase,
        });
      }
    }
    localResult = evaluateLocal(
      ctx.targetKeyword,
      currentContent,
      serpData,
      targetWordCount,
    );
    const finalGateEvaluation = buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: currentContent,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      articleTitle,
      poolKeywords: mergeRecommendedKeywordsForWriting(
        job.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
      ),
    });

    if (!skipLocalPipeline && !finalGateEvaluation.passed) {
      const softPass = isLocalGateSoftPass({
        gate: localGate,
        prediction: finalGateEvaluation.prediction,
        localScore: localResult.score,
        localPassThreshold: scoreConfig.localPassThreshold,
      });
      const deferToSemrush = shouldDeferCalibratedGateToSemrushRpa({
        gate: localGate,
        localResult,
        prediction: finalGateEvaluation.prediction,
        scoreConfig,
      });
      if (!softPass && !deferToSemrush) {
      await this.progressService.persistLocalSeoProgress(ctx, {
        localResult,
        optimizeRounds,
        content: currentContent,
        passed: false,
        predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
        gateMode: localGate.mode,
        existingSeoCheck: seoCheck,
        clearWorkflowProgress: true,
      });
      const failMessage =
        localGate.mode === 'calibrated'
          ? `预测 Semrush ${finalGateEvaluation.prediction?.predictedSemrush ?? '—'}/10，未达 ${localGate.threshold} 分门槛，须先优化后再 Semrush 终检`
          : `本地 SEO 评分 ${localResult.score} 分，未达 ${localGate.threshold} 分门槛：${localResult.suggestions.join('；')}`;
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, failMessage);
      }
      if (deferToSemrush) {
        this.logger.info('Calibrated gate deferred to Semrush RPA — local pre-check passed, Sem is authority', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.calibrated_defer_to_semrush_rpa',
          localScore: localResult.score,
          predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
          threshold: localGate.threshold,
        });
      } else {
      this.logger.info('Calibrated local gate soft pass — proceeding to Semrush RPA', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.local_gate_soft_pass',
        predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
        threshold: localGate.threshold,
        localScore: localResult.score,
      });
      }
    }

    const recommendedKeywords = mergeRecommendedKeywordsForWriting(
      job.briefData,
      localResult.recommendedKeywords,
      ctx.targetKeyword,
    );

    logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.local_gate', {
      gateMode: localGate.mode,
      gatePassed: finalGateEvaluation.passed,
      localScore: localResult.score,
      predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
      gateThreshold: localGate.threshold,
      deferToSemrushRpa: shouldDeferCalibratedGateToSemrushRpa({
        gate: localGate,
        localResult,
        prediction: finalGateEvaluation.prediction,
        scoreConfig,
      }),
      recommendedKeywords: summarizeFlowKeywords(recommendedKeywords),
      recommendedKeywordCount: recommendedKeywords.length,
      wordCount: flowWordCount(currentContent),
    });

    if (finalGateEvaluation.passed || isLocalGateSoftPass({
      gate: localGate,
      prediction: finalGateEvaluation.prediction,
      localScore: localResult.score,
      localPassThreshold: scoreConfig.localPassThreshold,
    }) || shouldDeferCalibratedGateToSemrushRpa({
      gate: localGate,
      localResult,
      prediction: finalGateEvaluation.prediction,
      scoreConfig,
    })) {
      await this.progressService.persistLocalSeoProgress(ctx, {
        localResult,
        optimizeRounds,
        content: currentContent,
        passed: finalGateEvaluation.passed,
        predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
        gateMode: localGate.mode,
        existingSeoCheck: seoCheck,
      });
    }

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
    const persistedLocalFields = buildLocalGatePersistedFields({
      gate: localGate,
      localScore: localResult.score,
      prediction: persistedLocalGate.prediction,
    });

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: null,
      contentScore: buildPipelineContentScoreSnapshot({
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
      }),
      local: {
        score: localResult.score,
        breakdown: localResult.breakdown,
        suggestions: localResult.suggestions,
        metrics: localResult.metrics,
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
        localSeoScore: localResult.score,
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
      localScore: localResult.score,
      semrushScore: semrushResult.skipped ? null : semrushResult.overall,
      optimizeRounds,
      semrushOptimizeRounds,
    });
    logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.completed', {
      localScore: localResult.score,
      semrushScore: semrushResult.skipped ? null : semrushResult.overall,
      localOptimizeRounds: optimizeRounds,
      semrushOptimizeRounds,
      wordCount: flowWordCount(currentContent),
      semrushPassed:
        !semrushResult.skipped && semrushResult.overall >= scoreConfig.semrushPassThreshold,
    });
  }
}
