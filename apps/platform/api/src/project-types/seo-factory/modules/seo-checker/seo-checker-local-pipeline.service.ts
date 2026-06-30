/**
 * SEO 查分流水线：本地优化轮次（M6 初稿后本地进门闸）。
 *
 * 边界：
 * - 不负责：Semrush RPA 终检（SeoCheckerSemrushPipelineService）
 *
 * 入口：
 * - SeoCheckerLocalPipelineService
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { LlmService } from '../llm/llm.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerLifecycleService } from './seo-checker-lifecycle.service';
import {
  isLocalGateNearMiss,
  isLocalGateSoftPass,
  shouldAcceptLocalGateCandidate,
  shouldDeferCalibratedGateToSemrushRpa,
  resolveLocalGateRoundCap,
} from '../../utils/score-calibration-local-align.util';
import { formatFocusDimensions } from '../llm/optimize-history-context.util';
import { buildContextualKeywordWeavingInstruction } from '../../providers/semrush/semrush-keyword-coverage.util';
import { countOptimizeRounds, hasOptimizeBaseline } from '../../utils/seo-pipeline.util';
import { flowWordCount, logSeoPipelineFlow, summarizeFlowKeywords } from '../../utils/seo-pipeline-flow-log.util';
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
  flowCtx,
} from './seo-checker-scoring.util';
import { mergeRecommendedKeywordsForWriting } from './seo-checker-keywords.util';
import {
  buildLocalGateEvaluation,
  applyCalibratedFinalGateBoost,
  applyDeterministicLocalBoost,
} from './seo-checker-gate.util';
import { buildLocalOptimizeContext } from './seo-checker-local-context.util';
import type {
  PostDraftLocalPipelineInput,
  PostDraftLocalPipelineResult,
} from './seo-checker-pipeline.types';

@Injectable()
export class SeoCheckerLocalPipelineService {
  constructor(
    private readonly llmService: LlmService,
    private readonly logger: LoggerService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly lifecycleService: SeoCheckerLifecycleService,
  ) {}

  async runLocalOptimization(input: PostDraftLocalPipelineInput): Promise<PostDraftLocalPipelineResult> {
    const { ctx, job, initialLocalResult } = input;
    const {
      scoreConfig,
      roundCapOptions,
      content: initialContent,
      articleTitle,
      serpData,
      optimizeHistory,
      seoCheck,
      briefTargetWordCount,
      semrushCompetitorWordCount,
      targetWordCount,
      calibrationRuntime,
      localGate,
      forceRerun,
      semrushResumable,
      skipLocalPipeline,
    } = input.setup;

    let currentContent = initialContent;
    let localResult = initialLocalResult;
    let optimizeRounds = countOptimizeRounds(optimizeHistory, 'local');

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
    return {
      currentContent,
      localResult,
      optimizeRounds,
      finalGateEvaluation,
      recommendedKeywords,
      skipLocalPipeline,
    };
  }
}
