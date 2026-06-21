/**
 * SEO 查分服务：本地 TF-IDF 前置校验 → 达标后 Semrush 终检。
 *
 * 边界：
 * - 不负责：初稿生成（LlmService）、工作流状态机（WorkflowService）
 *
 * 入口：
 * - SeoCheckerService
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { scoreLocalSeo, buildLocalScoreGapPlan, boostLocalSeoContent, LOCAL_PARAGRAPH_MAX_WORDS, validateAndFixSemrushStructure, detectSemrushStructureErrors, countSemrushComplexWordHits, detectHardToReadSentences, formatHardToReadSentenceAuditBlock, injectSemrushWordCountExpansion, computeSemrushWordGap, applySemrushDefaultComplexWordFixes, applyFleschTowardSemrushTarget, applyKeywordDensityNudge, isFleschProgressTowardTarget, SEMRUSH_FLESCH_TARGET_DEFAULT, resolveSemrushArticleTitle, analyzeSemrushTitleIssues, SEMRUSH_TITLE_MAX_CHARS, SEMRUSH_TITLE_WORD_MIN, SEMRUSH_TITLE_WORD_MAX, type LocalSeoScoreResult } from '@wm/shared-core';
import {
  type SeoScore,
  type SeoCheckInput,
} from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  LOCAL_SEO_NEAR_MISS_MARGIN,
  SEMRUSH_NEAR_MISS_MARGIN,
  SEMRUSH_WORD_GAP_INJECT_MIN,
} from '../../constants/seo-score';
import {
  resolveSiteSeoScoreConfig,
  DEFAULT_SITE_SEO_SCORE_CONFIG,
  hasExplicitSiteSeoScoreSettings,
  buildScoreThresholdsSnapshot,
  type ResolvedSiteSeoScoreConfig,
} from '../../constants/site-seo-score-settings';
import { filterSemrushRecommendedKeywords } from '../../providers/semrush/semrush-keywords.util';
import {
  canResumeSemrushOptimization,
  countOptimizeRounds,
  hasOptimizeBaseline,
  resolveSemrushOptimizeRoundCap,
  shouldAcceptSemrushCandidate,
  isSemrushSurgicalTier,
  shouldSkipLocalPipeline,
  type SeoOptimizeHistoryEntry,
} from '../../utils/seo-pipeline.util';
import {
  buildSemrushBoostOptions,
  buildSemrushOptimizeContext,
  buildSemrushReadabilityAudit,
  buildFallbackSemrushSuggestions,
  buildSemrushRewriteSuggestions,
  resolveSemrushBoostWordTarget,
} from '../../utils/semrush-optimize.util';
import {
  applySemrushNearMissDeterministicFixes,
  applySemrushSidebarComplexWordFixes,
  buildSemrushNearMissSurgicalInstruction,
  buildSemrushWordGapSurgicalInstruction,
  isSemrushUltraNearMiss,
} from '../../utils/semrush-near-miss.util';
import {
  appendSeoAnalysisSnapshot,
  buildLocalAnalysisSnapshot,
  buildSemrushAnalysisSnapshot,
} from '../../utils/seo-analysis-snapshot.util';
import {
  collectPresentSeoPhrases,
  findMissingSemrushKeywords,
  mergeSemrushKeywordLists,
} from '../../providers/semrush/semrush-keyword-coverage.util';
import {
  buildSemrushCheckInputFromContent,
  buildSemrushSubmittedKeywords,
} from '../../providers/semrush/semrush-submitted-keywords.util';
import type { GenerateOptimizeMeta, LlmJobContext } from '../llm/llm.service';
import { LlmService } from '../llm/llm.service';

interface WorkflowProgress {
  phase: 'local-scoring' | 'local' | 'semrush-check' | 'semrush';
  round?: number;
  maxRounds?: number;
  message: string;
  localScore?: number;
  semrushScore?: number;
  updatedAt: string;
}
import {
  isSemrushCheckStale,
  shouldRecoverOrphanOptimizing,
  type SemrushCheckPending,
} from '../../constants/semrush-check';
import { withWorkflowMeta } from '../../constants/workflow-resume';
import { resolveOrphanOptimizingRestore } from '../../utils/semrush-orphan-restore.util';
import { formatFocusDimensions } from '../llm/optimize-history-context.util';
import type { ArticleImageRecord } from '../illustration/article-image.util';
import {
  countMissingEnrichments,
  mergeDraftEnrichments,
} from '../illustration/draft-enrichment.util';
import type { InternalLinkRecord } from '../linking/link-match.util';
import { SemrushQueueService } from '../../services/semrush-queue.service';
import { persistSemrushQueueCheckpoint } from '../../utils/semrush-queue-checkpoint.util';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import { ScoreCalibrationService } from '../score-calibration/score-calibration.service';
import {
  appendCalibrationShadow,
  buildCalibrationPrediction,
  buildCalibrationProxyScore,
  createCalibrationShadowEntry,
  resolveSemrushRecheckDecision,
  type CalibrationShadowEntry,
  type ScoreCalibrationRuntime,
} from '../../utils/score-calibration-runtime.util';
import {
  isLocalGateNearMiss,
  isLocalGatePassed,
  isLocalGateSoftPass,
  localGatePointsToGo,
  resolveLocalAlignEffective,
  resolveLocalGateContext,
  resolveLocalGateRoundCap,
  resolveCalibratedOptimizeFocus,
  shouldAcceptLocalGateCandidate,
  shouldSkipLocalOptimizationAligned,
  type LocalGateContext,
} from '../../utils/score-calibration-local-align.util';
import {
  extractBriefRecommendedKeywords,
  resolveSubmittedKeywords,
  scoreArticleContentFromLocal,
} from '../../utils/article-content-score.util';
import { buildContentScoreSnapshot } from '../../utils/article-content-score-snapshot.util';
import type { ScoreCalibrationPrediction, ContentScoreSnapshot } from '@wm/shared-core';

interface SerpOrganicRow {
  title?: string;
  snippet?: string;
}

interface OptimizeHistoryEntry extends SeoOptimizeHistoryEntry {}

interface PersistedSeoCheckData {
  optimizationRerun?: {
    reason?: 'gsc_underperform' | 'manual';
    requestedAt?: string;
  };
  local?: {
    score?: number;
    passed?: boolean;
    predictedSemrush?: number;
    gateMode?: 'legacy' | 'calibrated';
  };
  semrush?: {
    skipped?: boolean;
    passed?: boolean;
    overall?: number;
    suggestions?: string[];
    node?: string;
    nodeLabel?: string;
    suggestionDetails?: SeoScore['suggestionDetails'];
    actionableIssues?: SeoScore['actionableIssues'];
    analysisSource?: SeoScore['analysisSource'];
    apiUrls?: string[];
    semrushCompetitorWordCount?: number;
    semrushCurrentWordCount?: number;
    semrushReadabilityScore?: number;
    semrushEvaluationRoute?: string;
    semrushEvaluationContentFingerprint?: string;
    semrushTargetKeywords?: string[];
    semrushRecommendedKeywords?: string[];
    semrushMissingTargetKeywords?: string[];
    semrushMissingRecommendedKeywords?: string[];
    submittedKeywords?: string[];
    semrushCheckRecord?: SeoScore['semrushCheckRecord'];
  };
}

const GSC_UNDERPERFORM_OPTIMIZE_HINTS = [
  '搜索表现偏弱：强化开篇与标题一致性，首段直接回答搜索意图',
  '对照竞品补充高价值信息点，提升点击动机与页面深度',
];

@Injectable()
export class SeoCheckerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly semrushQueue: SemrushQueueService,
    private readonly scoreCalibrationService: ScoreCalibrationService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStaleSemrushChecks();
  }

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
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const optimizeHistory = draftData.optimizeHistory ?? [];
    const seoCheck = (job.seoCheckData ?? {}) as PersistedSeoCheckData;
    const calibrationRuntime = await this.loadCalibrationRuntime(ctx, job.siteId);
    const localGate = resolveLocalGateContext({
      localAlignEnabled: calibrationRuntime.localAlignEnabled,
      localAlignEffective: calibrationRuntime.localAlignEffective,
      scoreConfig,
    });
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
    const skipLocalPipeline = shouldSkipLocalPipeline(localAlreadyPassed, semrushResumable);

    let currentContent = content;
    await this.touchWorkflowProgress(ctx, {
      phase: 'local-scoring',
      message: forceRerun
        ? '搜索表现偏弱，重新优化评分中…'
        : skipLocalPipeline
          ? semrushResumable
            ? `续跑 Semrush 优化（当前 ${job.semrushScore}/10，目标 ≥${scoreConfig.semrushPassThreshold}，本地分仅参考）…`
            : `本地预检已通过（${job.localSeoScore ?? seoCheck.local?.score ?? '—'} 分），进入 Semrush 终检…`
          : '正在计算本地预检分…',
    });
    let localResult = this.evaluateLocal(ctx.targetKeyword, currentContent, serpData, targetWordCount);
    let optimizeRounds = countOptimizeRounds(optimizeHistory, 'local');

    if (!skipLocalPipeline) {
      const initialBoost = this.applyDeterministicLocalBoost(
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
      let gateEvaluation = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
        localResult,
        targetKeyword: ctx.targetKeyword,
        content: currentContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        articleTitle,
        poolKeywords: this.mergeRecommendedKeywordsForWriting(
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
      await this.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: localRoundCap,
        localScore: localResult.score,
        message:
          localGate.mode === 'calibrated'
            ? `预测 Semrush ${gateEvaluation.prediction?.predictedSemrush ?? '—'}/10，${pointsToGo > 0 ? `差 ${pointsToGo} 分达标` : '优化中'}（第 ${optimizeRounds}/${localRoundCap} 轮，目标 ${gateTargetLabel}）…`
            : pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN
              ? `本地预检 ${localResult.score} 分（差 ${pointsToGo} 分达标），按建议定向改写中（第 ${optimizeRounds}/${localRoundCap} 轮）…`
              : `本地预检 ${localResult.score} 分，AI 优化中（第 ${optimizeRounds}/${localRoundCap} 轮，目标 ${gateTargetLabel}，约 1–3 分钟）…`,
      });
      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        job.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
      );
      this.logger.info('Local SEO below threshold, optimizing draft', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.local_optimize',
        round: optimizeRounds,
        score: localResult.score,
        recommendedKeywordCount: keywordsForAi.length,
      });

      const localOptCtx = this.buildLocalOptimizeContext(
        localResult,
        currentContent,
        scoreConfig,
        localGate,
        gateEvaluation.prediction,
        { targetKeyword: ctx.targetKeyword, articleTitle },
      );
      if (pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN) {
        const densityNudged = applyKeywordDensityNudge(ctx.targetKeyword, currentContent);
        if (densityNudged !== currentContent) {
          const nudgedResult = this.evaluateLocal(
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
          const fixedResult = this.evaluateLocal(
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
          const fleschResult = this.evaluateLocal(
            ctx.targetKeyword,
            fleschFixed,
            serpData,
            targetWordCount,
          );
          const fleschGate = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
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
      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        localOptCtx.suggestions,
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
          localScoreBreakdown: this.formatLocalScoreBreakdown(localResult),
          focusDimensions: formatFocusDimensions(localResult.breakdown),
          readabilityPriority: localOptCtx.readabilityPriority,
          serpPriority: localOptCtx.serpPriority,
          fleschPriority: localOptCtx.fleschPriority,
          hardSentencePriority: localOptCtx.hardSentencePriority,
          titlePriority: localOptCtx.titlePriority,
          articleTitle: localOptCtx.resolvedTitle,
          readabilityAudit: localOptCtx.readabilityAudit,
          pointsToGo: localOptCtx.pointsToGo,
          scoreGapPlan: localOptCtx.scoreGapPlan,
          contentCoverageMaxed: localOptCtx.contentCoverageMaxed,
          serpCoverageMaxed: localOptCtx.serpCoverageMaxed,
          keywordDensityFocus: localOptCtx.keywordDensityFocus,
          protectedSeoPhrases: this.collectProtectedSeoPhrases(
            currentContent,
            ctx.targetKeyword,
            keywordsForAi,
          ),
        },
      );
      currentContent = boostLocalSeoContent(currentContent, { targetWordCount });
      const candidateResult = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
      );
      const candidateGateEvaluation = this.buildLocalGateEvaluation(
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
      });
      if (improved) {
        bestLocalScore = candidateResult.score;
        bestLocalContent = currentContent;
        bestLocalResult = candidateResult;
        localResult = candidateResult;
        bestGateScore = candidateGateEvaluation.gateScore;
        bestPredictedSemrush = candidateGateEvaluation.prediction?.predictedSemrush ?? bestPredictedSemrush;
        gateEvaluation = candidateGateEvaluation;
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
      gateEvaluation = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
        localResult: bestLocalResult,
        targetKeyword: ctx.targetKeyword,
        content: bestLocalContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        articleTitle,
        poolKeywords: this.mergeRecommendedKeywordsForWriting(
          job.briefData,
          bestLocalResult.recommendedKeywords,
          ctx.targetKeyword,
        ),
      });
      await this.persistLocalSeoProgress(ctx, {
        localResult: bestLocalResult,
        optimizeRounds,
        content: bestLocalContent,
        passed: gateEvaluation.passed,
        predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
        gateMode: localGate.mode,
        existingSeoCheck: seoCheck,
      });
      }

      const finalBoost = this.applyDeterministicLocalBoost(
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
      this.logger.info('Resuming SEO pipeline: local pre-check already passed', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.resume_local_skipped',
        localScore: job.localSeoScore ?? localResult.score,
      });
    }

    if (forceRerun) {
      const preForceGate = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
        localResult,
        targetKeyword: ctx.targetKeyword,
        content: currentContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        articleTitle,
      });
      if (preForceGate.passed) {
      const refreshed = await this.runForcedLocalRefresh(ctx, {
        briefData: job.briefData,
        currentContent,
        localResult,
        serpData,
        targetWordCount,
        optimizeRounds,
        reason: seoCheck.optimizationRerun?.reason,
        scoreConfig,
        calibrationRuntime,
        articleTitle,
      });
      currentContent = refreshed.content;
      localResult = refreshed.localResult;
      optimizeRounds = refreshed.optimizeRounds;
      }
    }

    currentContent = await this.reconcileDraftEnrichments(ctx, currentContent);
    if (localGate.mode === 'calibrated' && !skipLocalPipeline) {
      const calibratedBoost = this.applyCalibratedFinalGateBoost(
        calibrationRuntime,
        localGate,
        {
          keyword: ctx.targetKeyword,
          content: currentContent,
          serpData,
          targetWordCount,
          jobBriefData: job.briefData,
          poolKeywords: this.mergeRecommendedKeywordsForWriting(
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
    localResult = this.evaluateLocal(
      ctx.targetKeyword,
      currentContent,
      serpData,
      targetWordCount,
    );
    const finalGateEvaluation = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: currentContent,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      articleTitle,
      poolKeywords: this.mergeRecommendedKeywordsForWriting(
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
      if (!softPass) {
      await this.persistLocalSeoProgress(ctx, {
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
      this.logger.info('Calibrated local gate soft pass — proceeding to Semrush RPA', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.local_gate_soft_pass',
        predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
        threshold: localGate.threshold,
        localScore: localResult.score,
      });
    }

    const recommendedKeywords = this.mergeRecommendedKeywordsForWriting(
      job.briefData,
      localResult.recommendedKeywords,
      ctx.targetKeyword,
    );

    if (finalGateEvaluation.passed || isLocalGateSoftPass({
      gate: localGate,
      prediction: finalGateEvaluation.prediction,
      localScore: localResult.score,
      localPassThreshold: scoreConfig.localPassThreshold,
    })) {
      await this.persistLocalSeoProgress(ctx, {
        localResult,
        optimizeRounds,
        content: currentContent,
        passed: finalGateEvaluation.passed,
        predictedSemrush: finalGateEvaluation.prediction?.predictedSemrush,
        gateMode: localGate.mode,
        existingSeoCheck: seoCheck,
      });
    }

    await this.touchWorkflowProgress(ctx, {
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
      semrushResult = this.restoreSemrushResult(seoCheck.semrush!, job.semrushScore!);
      preferredNodeKey = semrushResult.node?.trim() || undefined;
      this.logger.info('Resuming SEO pipeline: Semrush optimization from last checkpoint', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.resume_semrush',
        semrushScore: job.semrushScore,
        priorOptimizeRounds: countOptimizeRounds(optimizeHistory, 'semrush'),
      });
    } else {
      if (calibrationRuntime.shadowEnabled) {
        const prePrediction = this.buildCalibrationPredictionForContent(calibrationRuntime, {
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

      semrushResult = await this.runSemrushCheck(
        {
          content: currentContent,
          keyword: ctx.targetKeyword,
          recommendedKeywords,
        },
        ctx,
      );
      preferredNodeKey = semrushResult.node?.trim() || undefined;

      if (calibrationRuntime.shadowEnabled && !semrushResult.skipped) {
        const postPrediction = this.buildCalibrationPredictionForContent(calibrationRuntime, {
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
        await this.appendSemrushRpaSnapshot(ctx, {
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

    const optimized = await this.executeSemrushOptimizeRounds(ctx, {
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

    currentContent = await this.reconcileDraftEnrichments(ctx, currentContent);

    const latestJob = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const latestDraft = (latestJob?.draftData ?? draftData) as {
      content?: string;
      optimizeHistory?: unknown[];
    };
    const prevCheck = (latestJob?.seoCheckData ?? {}) as Record<string, unknown>;

    const submittedKeywordsFinal = this.resolvePersistedSubmittedKeywords(
      currentContent,
      ctx.targetKeyword,
      recommendedKeywords,
      semrushResult,
    );

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: null,
      contentScore: this.buildPipelineContentScoreSnapshot({
        ctx,
        content: currentContent,
        localResult,
        semrushResult,
        calibrationRuntime,
        targetWordCount,
        submittedKeywords: submittedKeywordsFinal,
        missingKeywordCount: this.countSemrushMissingKeywords(
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
        passed: localResult.score >= scoreConfig.localPassThreshold,
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
  }

  /** Brief 推荐实体词 + 本地评分缺失 SERP 词，供 LLM 写入与 Semrush 提交 */
  private async reconcileDraftEnrichments(ctx: LlmJobContext, content: string): Promise<string> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const draft = (job?.draftData ?? {}) as {
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };

    const merged = mergeDraftEnrichments({
      content,
      internalLinks: draft.internalLinks,
      articleImages: draft.articleImages,
    });

    if (merged === content.trim()) {
      return content;
    }

    const missing = countMissingEnrichments({
      content,
      internalLinks: draft.internalLinks,
      articleImages: draft.articleImages,
    });

    await this.llmService.revertDraftContent(ctx, merged);

    this.logger.info('Draft enrichments restored after optimize', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.enrichment_restored',
      missingLinks: missing.missingLinks,
      missingImages: missing.missingImages,
    });

    return merged;
  }

  /** Brief 推荐实体词 + 本地评分缺失 SERP 词，供 LLM 写入与 Semrush 提交 */
  private mergeRecommendedKeywordsForWriting(
    briefData: unknown,
    localRecommendedKeywords: string[],
    targetKeyword: string,
    semrushRecommendedKeywords?: string[],
  ): string[] {
    const briefRoot = (briefData as { outline?: Record<string, unknown> } | null)?.outline ?? {};
    const fromBrief = Array.isArray(briefRoot.recommendedEntities)
      ? briefRoot.recommendedEntities.filter((item): item is string => typeof item === 'string')
      : [];

    const main = targetKeyword.trim().toLowerCase();
    const splitParts = (items: string[]) =>
      items.flatMap((item) => item.split(/[,，]/).map((part) => part.trim()));

    const merged = [...new Set([...fromBrief, ...localRecommendedKeywords, ...(semrushRecommendedKeywords ?? [])])]
      .flatMap((item) => splitParts([item]))
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.toLowerCase() !== main);

    return filterSemrushRecommendedKeywords(merged, targetKeyword);
  }

  /** 刷新本地 SEO 评分；若规则拆句/拆段可提分则写回正文 */
  async refreshLocalSeoScore(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        siteId: true,
        draftData: true,
        serpData: true,
        briefData: true,
        seoCheckData: true,
        localSeoScore: true,
        site: { select: { settings: true } },
      },
    });

    if (!job?.draftData) {
      return;
    }

    const scoreConfig = resolveSiteSeoScoreConfig(job.site?.settings);
    const calibrationRuntime = await this.loadCalibrationRuntime(ctx, job.siteId);
    const localGate = resolveLocalGateContext({
      localAlignEnabled: calibrationRuntime.localAlignEnabled,
      localAlignEffective: calibrationRuntime.localAlignEffective,
      scoreConfig,
    });

    const draft = job.draftData as { content?: string; title?: string };
    const content = draft.content?.trim();
    const refreshArticleTitle = draft.title;
    if (!content) {
      return;
    }

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const currentResult = this.evaluateLocal(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
    );

    const boosted = this.applyDeterministicLocalBoost(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
      currentResult.score,
    );

    if (boosted.applied && boosted.content !== content) {
      const existingDraft = job.draftData as Record<string, unknown>;
      await this.prisma.articleJob.update({
        where: { id: ctx.jobId },
        data: {
          draftData: { ...existingDraft, content: boosted.content } as object,
        },
      });
    }

    const localResult = boosted.result;
    const gateEvaluation = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: boosted.content,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      articleTitle: refreshArticleTitle,
    });

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: localResult.score,
        seoCheckData: {
          ...prevCheck,
          scoreThresholds: buildScoreThresholdsSnapshot(scoreConfig),
          local: {
            score: localResult.score,
            breakdown: localResult.breakdown,
            suggestions: localResult.suggestions,
            metrics: localResult.metrics,
            passed: gateEvaluation.passed,
            predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
            gateMode: localGate.mode,
            refreshedAt: new Date().toISOString(),
          },
        } as object,
      },
    });
  }

  async runManualSemrushCheck(ctx: LlmJobContext): Promise<void> {
    try {
      await this.runManualSemrushCheckInner(ctx);
    } catch (error) {
      if (this.isSemrushWorkAbortedError(error)) {
        this.logger.info('Manual Semrush check aborted in-flight', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.manual_semrush_aborted',
          reason: error instanceof BusinessException ? error.message : String(error),
        });
        return;
      }
      throw error;
    }
  }

  isSemrushWorkAbortedError(error: unknown): boolean {
    return (
      error instanceof BusinessException &&
      error.context?.semrushAborted === true
    );
  }

  /** 手动触发：本地预检达标（≥95）后才跑 Semrush RPA 终检 */
  private async runManualSemrushCheckInner(ctx: LlmJobContext): Promise<void> {
    if (process.env.SEMRUSH_ENABLED !== 'true') {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'Semrush 未启用，请在 apps/platform/api/.env 设置 SEMRUSH_ENABLED=true',
      );
    }

    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        siteId: true,
        draftData: true,
        serpData: true,
        briefData: true,
        seoCheckData: true,
        status: true,
        site: { select: { settings: true } },
      },
    });

    if (!job?.draftData) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿不存在，无法检测');
    }

    const scoreConfig = resolveSiteSeoScoreConfig(job.site?.settings);
    const roundCapOptions = {
      strictCap: hasExplicitSiteSeoScoreSettings(job.site?.settings),
    };
    const calibrationRuntime = await this.loadCalibrationRuntime(ctx, job.siteId);
    const localGate = resolveLocalGateContext({
      localAlignEnabled: calibrationRuntime.localAlignEnabled,
      localAlignEffective: calibrationRuntime.localAlignEffective,
      scoreConfig,
    });

    const draftData = job.draftData as {
      content?: string;
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };
    const content = draftData.content?.trim();
    if (!content) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法检测');
    }

    const reconciledContent = await this.reconcileDraftEnrichments(ctx, content);

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    let localResult = this.evaluateLocal(
      ctx.targetKeyword,
      reconciledContent,
      serpData,
      briefData?.outline?.targetWordCount ?? 1500,
    );
    const manualGateEvaluation = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: reconciledContent,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount: briefData?.outline?.targetWordCount ?? 1500,
    });

    if (!manualGateEvaluation.passed) {
      const softPass = isLocalGateSoftPass({
        gate: localGate,
        prediction: manualGateEvaluation.prediction,
        localScore: localResult.score,
        localPassThreshold: scoreConfig.localPassThreshold,
      });
      if (!softPass) {
      const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
      await this.prisma.articleJob.update({
        where: { id: ctx.jobId },
        data: {
          localSeoScore: localResult.score,
          seoCheckData: {
            ...prevCheck,
            local: {
              score: localResult.score,
              breakdown: localResult.breakdown,
              suggestions: localResult.suggestions,
              metrics: localResult.metrics,
              passed: false,
              predictedSemrush: manualGateEvaluation.prediction?.predictedSemrush,
              gateMode: localGate.mode,
              refreshedAt: new Date().toISOString(),
            },
          } as object,
        },
      });
      const failMessage =
        localGate.mode === 'calibrated'
          ? `预测 Semrush ${manualGateEvaluation.prediction?.predictedSemrush ?? '—'}/10，未达 ${localGate.threshold} 分门槛，须先优化后再 Semrush 终检`
          : `本地预检 ${localResult.score} 分，未达 ${localGate.threshold} 分门槛，须先优化后再 Semrush 终检：${localResult.suggestions.join('；')}`;
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, failMessage);
      }
    }

    const recommendedKeywords = this.mergeRecommendedKeywordsForWriting(
      job.briefData,
      localResult.recommendedKeywords,
      ctx.targetKeyword,
    );
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const seoCheck = (job.seoCheckData ?? {}) as PersistedSeoCheckData;
    const calibrationShadowLog: CalibrationShadowEntry[] = Array.isArray(
      (seoCheck as Record<string, unknown>).calibrationShadow,
    )
      ? ((seoCheck as Record<string, unknown>).calibrationShadow as CalibrationShadowEntry[])
      : [];
    const draftWithHistory = job.draftData as {
      content?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
    };

    let currentContent = reconciledContent;
    await this.assertSemrushWorkNotCancelled(ctx);
    let semrushResult = await this.runSemrushCheck(
      {
        content: currentContent,
        keyword: ctx.targetKeyword,
        recommendedKeywords,
      },
      ctx,
    );
    const preferredNodeKey = semrushResult.node?.trim() || undefined;

    if (semrushResult.skipped) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        semrushResult.suggestions[0] ?? 'Semrush 查分已跳过',
      );
    }

    if (!hasOptimizeBaseline(draftWithHistory.optimizeHistory ?? [], 'semrush')) {
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

    const optimized = await this.executeSemrushOptimizeRounds(ctx, {
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      initialContent: currentContent,
      initialLocalResult: localResult,
      initialSemrushResult: semrushResult,
      seoCheck,
      recommendedKeywords,
      optimizeHistory: draftWithHistory.optimizeHistory ?? [],
      preferredNodeKey,
      calibrationRuntime,
      calibrationShadowLog,
      scoreConfig,
      roundCapOptions,
    });
    currentContent = optimized.content;
    localResult = optimized.localResult;
    semrushResult = optimized.semrushResult;
    calibrationShadowLog.splice(
      0,
      calibrationShadowLog.length,
      ...optimized.calibrationShadowLog,
    );

    await this.assertSemrushWorkNotCancelled(ctx);

    const latestJob = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const latestDraft = (latestJob?.draftData ?? draftData) as {
      content?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };
    const prevCheck = (latestJob?.seoCheckData ?? job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const {
      pending: _pending,
      manualCheckPreviousStatus: _manualPrev,
      lastManualCheckError: _lastErr,
      recoveredOrphanOptimizing: _recovered,
      cancelled: _cancelled,
      ...semrushRest
    } = prevSemrush;
    const optimizeHistory = latestDraft.optimizeHistory ?? [];
    const semrushOptimizeRounds = countOptimizeRounds(optimizeHistory, 'semrush');

    const manualSubmittedKeywords = this.resolvePersistedSubmittedKeywords(
      currentContent,
      ctx.targetKeyword,
      recommendedKeywords,
      semrushResult,
    );

    const seoCheckBase = {
      ...prevCheck,
      scoreThresholds: buildScoreThresholdsSnapshot(scoreConfig),
      contentScore: this.buildPipelineContentScoreSnapshot({
        ctx,
        content: currentContent,
        localResult,
        semrushResult,
        calibrationRuntime,
        targetWordCount,
        submittedKeywords: manualSubmittedKeywords,
        missingKeywordCount: this.countSemrushMissingKeywords(
          currentContent,
          ctx.targetKeyword,
          semrushResult,
          recommendedKeywords,
          manualSubmittedKeywords,
        ),
      }),
      local: {
        score: localResult.score,
        breakdown: localResult.breakdown,
        suggestions: localResult.suggestions,
        metrics: localResult.metrics,
        passed: localResult.score >= scoreConfig.localPassThreshold,
        refreshedAt: new Date().toISOString(),
      },
      semrush: {
        ...semrushRest,
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
        manualCheckAt: new Date().toISOString(),
        submittedKeywords: manualSubmittedKeywords,
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
        lastManualCheckEndedAt: new Date().toISOString(),
        semrushCheckRecord: semrushResult.semrushCheckRecord,
      },
      optimizeHistory,
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

    const seoCheckData =
      semrushResult.skipped || semrushResult.calibrationProxy
        ? seoCheckWithShadow
        : appendSeoAnalysisSnapshot(
          seoCheckWithShadow,
          buildSemrushAnalysisSnapshot({
            content: currentContent,
            targetKeyword: ctx.targetKeyword,
            submittedKeywords: manualSubmittedKeywords,
            semrushResult,
            localResult,
            round: semrushOptimizeRounds,
            kind: 'semrush_manual_check',
            includeFullContent: true,
            semrushMissingKeywordCount: this.countSemrushMissingKeywords(
              currentContent,
              ctx.targetKeyword,
              semrushResult,
              recommendedKeywords,
              manualSubmittedKeywords,
            ),
          }),
        );

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        status: 'COMPLETED',
        errorMessage: null,
        localSeoScore: localResult.score,
        semrushScore: semrushResult.overall,
        seoCheckData: seoCheckData as object,
        draftData: { ...latestDraft, content: currentContent } as object,
      },
    });

    this.logger.info('Manual Semrush check completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.manual_semrush',
      localScore: localResult.score,
      semrushScore: semrushResult.overall,
    });
  }

  async markManualSemrushFailed(
    ctx: LlmJobContext,
    errorMessage: string,
  ): Promise<void> {
    await this.finishManualSemrushCheck(ctx, errorMessage, false);
  }

  async cancelManualSemrushCheck(ctx: LlmJobContext, reason: string): Promise<void> {
    await this.finishManualSemrushCheck(ctx, reason, true);
  }

  async recoverStaleSemrushChecks(): Promise<void> {
    const jobs = await this.prisma.articleJob.findMany({
      where: { status: 'OPTIMIZING' },
      select: {
        id: true,
        traceId: true,
        organizationId: true,
        projectId: true,
        status: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    for (const job of jobs) {
      const pending = this.getSemrushPending(job.seoCheckData);
      const ctx = {
        jobId: job.id,
        traceId: job.traceId,
        organizationId: job.organizationId,
        projectId: job.projectId,
        targetKeyword: '',
      };

      if (pending && isSemrushCheckStale(pending.startedAt)) {
        await this.cancelManualSemrushCheck(
          ctx,
          'Semrush 检测超时，已自动取消（可重新检测）',
        );
        continue;
      }

      if (shouldRecoverOrphanOptimizing(job)) {
        await this.recoverOrphanOptimizingJob(
          ctx,
          '检测到僵死的优化状态，已自动恢复（可重新检测）',
        );
      }
    }
  }

  /** OPTIMIZING 且无 pending：工作流中断或失败后状态未回写 */
  async recoverOrphanOptimizingJob(
    ctx: LlmJobContext,
    reason: string,
  ): Promise<JobStatus> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        status: true,
        seoCheckData: true,
        localSeoScore: true,
        semrushScore: true,
        draftData: true,
        briefData: true,
      },
    });

    if (!job || job.status !== 'OPTIMIZING') {
      return (job?.status ?? 'FAILED') as JobStatus;
    }

    const plan = resolveOrphanOptimizingRestore(job);

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const { pending: _pending, manualCheckPreviousStatus: _prev, ...semrushRest } = prevSemrush;

    const seoCheckBase = plan.failedStep
      ? withWorkflowMeta(prevCheck, { failedStep: plan.failedStep })
      : prevCheck;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        status: plan.status,
        errorMessage: plan.manualSemrushInterrupted ? null : reason,
        seoCheckData: {
          ...seoCheckBase,
          workflowProgress: plan.manualSemrushInterrupted ? null : prevCheck.workflowProgress ?? null,
          semrush: {
            ...semrushRest,
            lastManualCheckError: reason,
            lastManualCheckEndedAt: new Date().toISOString(),
            recoveredOrphanOptimizing: true,
          },
        } as object,
      },
    });

    this.logger.warn('Recovered orphan OPTIMIZING job', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.orphan_optimizing_recovered',
      restoreStatus: plan.status,
      manualSemrushInterrupted: plan.manualSemrushInterrupted,
      failedStep: plan.failedStep,
      reason,
    });

    return plan.status;
  }

  /** 本地预检进度写入 DB（优化中/失败时供前端展示缺口与可读性计数） */
  private mergeSemrushRpaSnapshot(
    seoCheckData: Record<string, unknown>,
    input: {
      content: string;
      targetKeyword: string;
      recommendedKeywords: string[];
      semrushResult: SeoScore;
      localResult: LocalSeoScoreResult;
      round?: number;
      kind?: 'semrush_check' | 'semrush_manual_check';
      rolledBack?: boolean;
    },
  ): Record<string, unknown> {
    if (input.semrushResult.skipped || input.semrushResult.calibrationProxy === true) {
      return seoCheckData;
    }
    const submittedKeywords = this.resolvePersistedSubmittedKeywords(
      input.content,
      input.targetKeyword,
      input.recommendedKeywords,
      input.semrushResult,
    );
    return appendSeoAnalysisSnapshot(
      seoCheckData,
      buildSemrushAnalysisSnapshot({
        content: input.content,
        targetKeyword: input.targetKeyword,
        submittedKeywords,
        semrushResult: input.semrushResult,
        localResult: input.localResult,
        round: input.round,
        kind: input.kind,
        includeFullContent: true,
        semrushMissingKeywordCount: this.countSemrushMissingKeywords(
          input.content,
          input.targetKeyword,
          input.semrushResult,
          input.recommendedKeywords,
          submittedKeywords,
        ),
        rolledBack: input.rolledBack,
      }),
    );
  }

  /** 追加一次真实 Semrush RPA 分析快照（只增不改） */
  private async appendSemrushRpaSnapshot(
    ctx: LlmJobContext,
    input: {
      content: string;
      targetKeyword: string;
      recommendedKeywords: string[];
      semrushResult: SeoScore;
      localResult: LocalSeoScoreResult;
      round?: number;
      kind?: 'semrush_check' | 'semrush_manual_check';
      rolledBack?: boolean;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const seoCheckData = this.mergeSemrushRpaSnapshot(prevCheck, input);
    if (seoCheckData === prevCheck) {
      return;
    }
    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: { seoCheckData: seoCheckData as object },
    });
  }

  /** 本地预检进度写入 DB（优化中/失败时供前端展示缺口与可读性计数） */
  private async persistLocalSeoProgress(
    ctx: LlmJobContext,
    input: {
      localResult: LocalSeoScoreResult;
      optimizeRounds: number;
      content: string;
      passed: boolean;
      predictedSemrush?: number;
      gateMode?: 'legacy' | 'calibrated';
      existingSeoCheck: PersistedSeoCheckData;
      clearWorkflowProgress?: boolean;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as { optimizeHistory?: unknown[] };
    const prevCheck = (job?.seoCheckData ?? input.existingSeoCheck ?? {}) as Record<string, unknown>;

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: input.clearWorkflowProgress
        ? null
        : (prevCheck.workflowProgress ?? null),
      local: {
        score: input.localResult.score,
        breakdown: input.localResult.breakdown,
        suggestions: input.localResult.suggestions,
        metrics: input.localResult.metrics,
        optimizeRounds: input.optimizeRounds,
        passed: input.passed,
        ...(input.predictedSemrush !== undefined
          ? { predictedSemrush: input.predictedSemrush }
          : {}),
        ...(input.gateMode ? { gateMode: input.gateMode } : {}),
      },
      optimizeHistory: draft.optimizeHistory ?? prevCheck.optimizeHistory ?? [],
    };

    const seoCheckData = appendSeoAnalysisSnapshot(
      seoCheckBase,
      buildLocalAnalysisSnapshot({
        content: input.content,
        targetKeyword: ctx.targetKeyword,
        localResult: input.localResult,
        round: input.optimizeRounds,
        includeFullContent: true,
      }),
    );

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: input.localResult.score,
        draftData: { ...draft, content: input.content } as object,
        seoCheckData: seoCheckData as object,
      },
    });
  }

  /** Semrush 优化进度写入 DB（每轮结束后供前端展示最新分数） */
  private async persistSemrushProgress(
    ctx: LlmJobContext,
    input: {
      localResult: LocalSeoScoreResult;
      semrushResult: SeoScore;
      localOptimizeRounds: number;
      semrushOptimizeRounds: number;
      content: string;
      existingSeoCheck: PersistedSeoCheckData;
      recommendedKeywords: string[];
      targetKeyword: string;
      /** 本轮真实 RPA 候选结果（回滚轮也记录候选稿分数） */
      rpaSnapshot?: {
        content: string;
        localResult: LocalSeoScoreResult;
        semrushResult: SeoScore;
        rolledBack?: boolean;
      };
      scoreConfig: ResolvedSiteSeoScoreConfig;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as { optimizeHistory?: unknown[] };
    const prevCheck = (job?.seoCheckData ?? input.existingSeoCheck ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: prevCheck.workflowProgress ?? null,
      scoreThresholds: buildScoreThresholdsSnapshot(input.scoreConfig),
      local: {
        score: input.localResult.score,
        breakdown: input.localResult.breakdown,
        suggestions: input.localResult.suggestions,
        metrics: input.localResult.metrics,
        optimizeRounds: input.localOptimizeRounds,
        passed: input.localResult.score >= input.scoreConfig.localPassThreshold,
      },
      semrush: input.semrushResult.skipped
        ? { ...prevSemrush, skipped: true, suggestions: input.semrushResult.suggestions }
        : {
            ...prevSemrush,
            overall: input.semrushResult.overall,
            suggestions: input.semrushResult.suggestions,
            passed: input.semrushResult.overall >= input.scoreConfig.semrushPassThreshold,
            node: input.semrushResult.node,
            nodeLabel: input.semrushResult.nodeLabel,
            suggestionDetails: input.semrushResult.suggestionDetails,
            actionableIssues: input.semrushResult.actionableIssues,
            analysisSource: input.semrushResult.analysisSource,
            apiUrls: input.semrushResult.apiUrls,
            optimizeRounds: input.semrushOptimizeRounds,
            submittedKeywords: this.resolvePersistedSubmittedKeywords(
              input.content,
              input.targetKeyword,
              input.recommendedKeywords,
              input.semrushResult,
            ),
            semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
            semrushCurrentWordCount: input.semrushResult.semrushCurrentWordCount,
            semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
            semrushEvaluationRoute: input.semrushResult.semrushEvaluationRoute,
            semrushEvaluationContentFingerprint:
              input.semrushResult.semrushEvaluationContentFingerprint,
            semrushTargetKeywords: input.semrushResult.semrushTargetKeywords,
            semrushRecommendedKeywords: input.semrushResult.semrushRecommendedKeywords,
            semrushMissingTargetKeywords: input.semrushResult.semrushMissingTargetKeywords,
            semrushMissingRecommendedKeywords:
              input.semrushResult.semrushMissingRecommendedKeywords,
            semrushCheckRecord: input.semrushResult.semrushCheckRecord,
          },
      optimizeHistory: draft.optimizeHistory ?? prevCheck.optimizeHistory ?? [],
    };

    let seoCheckData: Record<string, unknown> = seoCheckBase;
    if (input.rpaSnapshot) {
      seoCheckData = this.mergeSemrushRpaSnapshot(seoCheckData, {
        content: input.rpaSnapshot.content,
        targetKeyword: input.targetKeyword,
        recommendedKeywords: input.recommendedKeywords,
        semrushResult: input.rpaSnapshot.semrushResult,
        localResult: input.rpaSnapshot.localResult,
        round: input.semrushOptimizeRounds,
        rolledBack: input.rpaSnapshot.rolledBack,
      });
    }

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: input.localResult.score,
        semrushScore: input.semrushResult.skipped ? null : input.semrushResult.overall,
        draftData: { ...draft, content: input.content } as object,
        seoCheckData: seoCheckData as object,
      },
    });
  }

  private getSemrushPending(seoCheckData: unknown): SemrushCheckPending | null {
    const data = (seoCheckData ?? {}) as { semrush?: { pending?: SemrushCheckPending } };
    return data.semrush?.pending ?? null;
  }

  /** 取消/僵死恢复后，中止仍在内存中执行的 Semrush 优化与 RPA */
  private async assertSemrushWorkNotCancelled(ctx: LlmJobContext): Promise<void> {
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

  /** 工作流优化阶段心跳，供前端展示进度并判断是否僵死 */
  private async touchWorkflowProgress(
    ctx: LlmJobContext,
    progress: Omit<WorkflowProgress, 'updatedAt'>,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        seoCheckData: {
          ...prevCheck,
          workflowProgress: {
            ...progress,
            updatedAt: new Date().toISOString(),
          } satisfies WorkflowProgress,
        } as object,
      },
    });
  }

  private async finishManualSemrushCheck(
    ctx: LlmJobContext,
    message: string,
    cancelled: boolean,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });

    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const pending = prevSemrush.pending as SemrushCheckPending | undefined;
    const restoreStatus = (pending?.previousStatus ?? 'FAILED') as JobStatus;
    const { pending: _pending, manualCheckPreviousStatus: _prev, ...semrushRest } = prevSemrush;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        status: restoreStatus,
        errorMessage: restoreStatus === 'COMPLETED' ? null : message,
        seoCheckData: {
          ...prevCheck,
          workflowProgress: restoreStatus === 'COMPLETED' ? null : prevCheck.workflowProgress ?? null,
          semrush: {
            ...semrushRest,
            lastManualCheckError: message,
            lastManualCheckEndedAt: new Date().toISOString(),
            cancelled: cancelled || undefined,
          },
        } as object,
      },
    });

    this.logger.warn(cancelled ? 'Manual Semrush check cancelled' : 'Manual Semrush check failed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: cancelled ? 'seo_checker.manual_semrush_cancelled' : 'seo_checker.manual_semrush_failed',
      errorMessage: message,
      restoreStatus,
    });
  }

  private buildLocalOptimizeContext(
    localResult: LocalSeoScoreResult,
    content: string,
    scoreConfig: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
    localGate?: LocalGateContext,
    prediction?: ScoreCalibrationPrediction | null,
    focusContext?: { targetKeyword?: string; articleTitle?: string },
  ): {
    suggestions: string[];
    readabilityPriority: boolean;
    serpPriority: boolean;
    fleschPriority: boolean;
    hardSentencePriority: boolean;
    titlePriority: boolean;
    resolvedTitle: string;
    readabilityAudit?: string;
    pointsToGo?: number;
    scoreGapPlan: string;
    contentCoverageMaxed: boolean;
    serpCoverageMaxed: boolean;
    keywordDensityFocus: boolean;
  } {
    const gate =
      localGate ??
      resolveLocalGateContext({
        localAlignEnabled: false,
        localAlignEffective: false,
        scoreConfig,
      });
    const pointsToGo = localGatePointsToGo({
      gate,
      localScore: localResult.score,
      prediction: prediction ?? null,
    });
    const nearMissMargin =
      gate.mode === 'calibrated' ? SEMRUSH_NEAR_MISS_MARGIN : LOCAL_SEO_NEAR_MISS_MARGIN;
    const readabilityGap = 20 - localResult.breakdown.readability;
    const nearMiss = pointsToGo > 0 && pointsToGo <= nearMissMargin;
    const serpCoverageMaxed = localResult.breakdown.serpTermAlignment >= 25;
    const keywordDensityFocus =
      localResult.breakdown.keywordCoverage < 25 && serpCoverageMaxed;
    const contentCoverageMaxed =
      localResult.breakdown.keywordCoverage >= 25 &&
      localResult.breakdown.serpTermAlignment >= 25;
    const m = localResult.metrics;
    const semNearMissPoints =
      gate.mode === 'calibrated' ? pointsToGo <= SEMRUSH_NEAR_MISS_MARGIN : false;
    const calibratedFocus =
      gate.mode === 'calibrated'
        ? resolveCalibratedOptimizeFocus({
            gate,
            localResult,
            pointsToGo,
            content,
            targetKeyword: focusContext?.targetKeyword,
            articleTitle: focusContext?.articleTitle,
          })
        : {
            serpPriority: false,
            readabilityPriority: false,
            fleschPriority: false,
            hardSentencePriority: false,
            titlePriority: false,
          };
    const titlePriority = calibratedFocus.titlePriority;
    const resolvedTitle = resolveSemrushArticleTitle({
      content,
      targetKeyword: focusContext?.targetKeyword ?? '',
      articleTitle: focusContext?.articleTitle,
    });
    const hardSentencePriority = calibratedFocus.hardSentencePriority;
    const readabilityPriority =
      (!titlePriority && !hardSentencePriority && calibratedFocus.readabilityPriority) ||
      (!titlePriority && !hardSentencePriority && contentCoverageMaxed && pointsToGo > 0) ||
      (!titlePriority &&
        !hardSentencePriority &&
        nearMiss &&
        ((gate.mode === 'calibrated' ? semNearMissPoints : pointsToGo <= 2) ||
          readabilityGap >= 2 ||
          m.longSentencesOver22 > 2 ||
          m.longParagraphsOver65 > 1 ||
          m.passiveVoiceHits > 6 ||
          (m.semrushComplexWordHits ?? 0) > 0 ||
          (m.hardToReadSentenceHits ?? 0) > 0));
    const serpPriority = calibratedFocus.serpPriority;
    const fleschPriority = calibratedFocus.fleschPriority;
    const suggestions = [...localResult.suggestions];
    const audit = this.auditReadability(content, m);
    const scoreGapPlan =
      gate.mode === 'calibrated'
        ? [
            `预测 Semrush 目标 ≥${gate.threshold}/10（实验室校准对齐）`,
            pointsToGo > 0
              ? `- 当前预测 ${prediction?.predictedSemrush ?? '—'}/10，还差 ${pointsToGo} 分`
              : '',
            fleschPriority && typeof m.fleschReadingEase === 'number'
              ? `- Flesch ${m.fleschReadingEase}，目标 ${m.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT} (±8)：简词、拆句（本地分已高时仍须做）`
              : '',
            serpPriority
              ? `- SERP 对齐 ${localResult.breakdown.serpTermAlignment}/25：补缺失实体词`
              : '',
            titlePriority
              ? `- 标题须 ≤${SEMRUSH_TITLE_MAX_CHARS} 字符、${SEMRUSH_TITLE_WORD_MIN}–${SEMRUSH_TITLE_WORD_MAX} 词（SWA 侧栏）`
              : '',
            hardSentencePriority && (m.hardToReadSentenceHits ?? 0) > 0
              ? `- 难读句 ${m.hardToReadSentenceHits} 处（须 ≤2）：只改 audit 列出的原句，禁止加实体词`
              : '',
            !hardSentencePriority &&
            readabilityPriority &&
            (m.hardToReadSentenceHits ?? 0) > 0
              ? `- 难读句 ${m.hardToReadSentenceHits} 处：逐句重写（≤22 词/句）`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : buildLocalScoreGapPlan(localResult, scoreConfig.localPassThreshold);

    if (gate.mode === 'calibrated' && pointsToGo > 0) {
      suggestions.unshift(
        `[Semrush 对齐] 预测 Semrush ${prediction?.predictedSemrush ?? '—'}/10，距 ${gate.threshold} 还差 ${pointsToGo} 分`,
      );
    }

    if (titlePriority) {
      const titleIssues = analyzeSemrushTitleIssues(resolvedTitle);
      for (const issue of titleIssues.slice(0, 2).reverse()) {
        suggestions.unshift(`[Semrush 对齐·标题] ${issue.message}`);
      }
      suggestions.unshift(
        `[Semrush 对齐·标题] 本轮只改 H1（≤${SEMRUSH_TITLE_MAX_CHARS} 字、${SEMRUSH_TITLE_WORD_MIN}–${SEMRUSH_TITLE_WORD_MAX} 词），禁止改正文`,
      );
    }

    if (serpPriority && localResult.recommendedKeywords.length > 0) {
      suggestions.unshift(
        `[Semrush 对齐·SERP] 补实体词（${localResult.breakdown.serpTermAlignment}/25）：${localResult.recommendedKeywords.slice(0, 8).join('、')}`,
      );
    }

    if (fleschPriority && typeof m.fleschReadingEase === 'number') {
      suggestions.unshift(
        `[Semrush 对齐·Flesch] 当前 ${m.fleschReadingEase}，目标约 ${m.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT}：缩短句子、替换复杂词（优先于加词/加段）`,
      );
    }

    if (hardSentencePriority && (m.hardToReadSentenceHits ?? 0) > 0) {
      suggestions.unshift(
        `[Semrush 对齐·难读句] ${m.hardToReadSentenceHits} 处须压到 ≤2：只改 audit 列出的原句，拆成 2 条短句`,
      );
    }

    if (readabilityPriority || hardSentencePriority || pointsToGo <= 2) {
      if (m.longSentencesOver22 > 2) {
        suggestions.unshift(
          `[可读性·必做] 将超长句从 ${m.longSentencesOver22} 条压到 ≤2 条（评分器按 >22 词计数，不是 25 词）`,
        );
      }
      if (m.longParagraphsOver65 > 1) {
        suggestions.unshift(
          `[可读性·必做] 将超长段从 ${m.longParagraphsOver65} 段压到 ≤1 段（>${LOCAL_PARAGRAPH_MAX_WORDS} 词/段）`,
        );
      }
      if (m.passiveVoiceHits > 6) {
        suggestions.unshift(
          `[可读性] 被动语态 ${m.passiveVoiceHits} 处，须减至 ≤6 处（可 +2 可读性分）`,
        );
      }
      if ((m.semrushComplexWordHits ?? 0) > 0) {
        suggestions.unshift(
          `[可读性·必做] 替换 ${m.semrushComplexWordHits} 处 Semrush 复杂词（如 traceability→clear records）`,
        );
      }
      if ((m.hardToReadSentenceHits ?? 0) > 0) {
        suggestions.unshift(
          `[可读性·必做] 重写 ${m.hardToReadSentenceHits} 处难读句（拆长句、减 and/or 并列）`,
        );
      }
    }

    if (pointsToGo === 1) {
      suggestions.unshift(
        serpCoverageMaxed
          ? '[+1 分模式] SERP 已满：只改 1 处可读性（替换 1 个复杂词或拆 1 条难读句），禁止加实体句'
          : '[+1 分模式] 只做 1 处最小改动：拆 1 条长句到 ≤22 词，或调密度到 0.8%–2.5%，或删 1 处被动；禁止加 SERP 凑句',
      );
    } else if (keywordDensityFocus) {
      suggestions.unshift(
        '[关键词密度] SERP 已满，本轮只调密度到 0.8%–2.5%（可 +4 分），禁止再凑实体词',
      );
    }

    return {
      suggestions,
      readabilityPriority,
      serpPriority,
      fleschPriority,
      hardSentencePriority,
      titlePriority,
      resolvedTitle,
      pointsToGo: pointsToGo > 0 ? pointsToGo : undefined,
      readabilityAudit:
        titlePriority ||
        hardSentencePriority ||
        readabilityPriority ||
        fleschPriority ||
        pointsToGo <= 2
          ? audit.promptText
          : undefined,
      scoreGapPlan,
      contentCoverageMaxed,
      serpCoverageMaxed,
      keywordDensityFocus,
    };
  }

  /** 校准模式：轮次用尽后确定性提升 Flesch/复杂词，抬高预测 Semrush */
  private applyCalibratedFinalGateBoost(
    calibrationRuntime: ScoreCalibrationRuntime,
    localGate: LocalGateContext,
    input: {
      keyword: string;
      content: string;
      serpData: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      jobBriefData?: unknown;
      poolKeywords?: string[];
      baselineResult: LocalSeoScoreResult;
      articleTitle?: string;
    },
  ): {
    content: string;
    result: LocalSeoScoreResult;
    applied: boolean;
    predictedSemrush?: number;
  } {
    const baselineGate = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult: input.baselineResult,
      targetKeyword: input.keyword,
      content: input.content,
      jobBriefData: input.jobBriefData,
      serpData: input.serpData,
      targetWordCount: input.targetWordCount,
      poolKeywords: input.poolKeywords,
      articleTitle: input.articleTitle,
    });
    if (baselineGate.passed) {
      return {
        content: input.content,
        result: input.baselineResult,
        applied: false,
        predictedSemrush: baselineGate.prediction?.predictedSemrush,
      };
    }

    let working = applyFleschTowardSemrushTarget(input.content, SEMRUSH_FLESCH_TARGET_DEFAULT);
    working = applySemrushDefaultComplexWordFixes(working);
    if (working === input.content) {
      return {
        content: input.content,
        result: input.baselineResult,
        applied: false,
        predictedSemrush: baselineGate.prediction?.predictedSemrush,
      };
    }

    const result = this.evaluateLocal(
      input.keyword,
      working,
      input.serpData,
      input.targetWordCount,
    );
    const boostedGate = this.buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult: result,
      targetKeyword: input.keyword,
      content: working,
      jobBriefData: input.jobBriefData,
      serpData: input.serpData,
      targetWordCount: input.targetWordCount,
      poolKeywords: input.poolKeywords,
      articleTitle: input.articleTitle,
    });
    const fleschBefore = input.baselineResult.metrics.fleschReadingEase ?? 0;
    const fleschAfter = result.metrics.fleschReadingEase ?? 0;
    const fleschProgress = isFleschProgressTowardTarget({
      before: fleschBefore,
      after: fleschAfter,
      target: SEMRUSH_FLESCH_TARGET_DEFAULT,
    });
    const gateImproved = boostedGate.gateScore >= baselineGate.gateScore - 0.02;
    if (gateImproved || fleschProgress) {
      return {
        content: working,
        result,
        applied: true,
        predictedSemrush: boostedGate.prediction?.predictedSemrush,
      };
    }
    return {
      content: input.content,
      result: input.baselineResult,
      applied: false,
      predictedSemrush: baselineGate.prediction?.predictedSemrush,
    };
  }

  /** 规则化拆句/删填充/压篇幅；仅当分数不降时采纳 */
  private applyDeterministicLocalBoost(
    keyword: string,
    content: string,
    serpData: { organic?: SerpOrganicRow[] } | null,
    targetWordCount: number,
    baselineScore: number,
    scoreConfig: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
  ): { content: string; result: LocalSeoScoreResult; applied: boolean } {
    let working = content;
    if (baselineScore >= scoreConfig.localPassThreshold - LOCAL_SEO_NEAR_MISS_MARGIN) {
      const densityNudged = applyKeywordDensityNudge(keyword, working);
      if (densityNudged !== working) {
        const densityResult = this.evaluateLocal(keyword, densityNudged, serpData, targetWordCount);
        if (densityResult.score >= baselineScore) {
          working = densityNudged;
          baselineScore = densityResult.score;
        }
      }
      const complexFixed = applySemrushDefaultComplexWordFixes(working);
      if (complexFixed !== working) {
        const complexResult = this.evaluateLocal(keyword, complexFixed, serpData, targetWordCount);
        if (complexResult.score >= baselineScore) {
          working = complexFixed;
        }
      }
    }
    const boosted = boostLocalSeoContent(working, { targetWordCount });
    if (boosted === working && working === content) {
      return {
        content,
        result: this.evaluateLocal(keyword, content, serpData, targetWordCount),
        applied: false,
      };
    }
    const result = this.evaluateLocal(keyword, boosted, serpData, targetWordCount);
    if (result.score >= baselineScore) {
      return { content: boosted, result, applied: true };
    }
    if (working !== content) {
      const fallbackResult = this.evaluateLocal(keyword, working, serpData, targetWordCount);
      if (fallbackResult.score >= baselineScore) {
        return { content: working, result: fallbackResult, applied: true };
      }
    }
    return {
      content,
      result: this.evaluateLocal(keyword, content, serpData, targetWordCount),
      applied: false,
    };
  }

  private auditReadability(
    content: string,
    metrics?: LocalSeoScoreResult['metrics'],
  ): {
    longSentenceCount: number;
    longParagraphCount: number;
    promptText: string;
  } {
    const countWords = (text: string) =>
      text.trim().split(/\s+/).filter(Boolean).length;

    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => countWords(s) >= 4);
    const longSentences = sentences.filter((s) => countWords(s) > 22);

    const bodyParagraphs = content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(
        (p) => p.length > 0 && !p.startsWith('#') && !p.startsWith('![') && !/^-\s+/.test(p),
      );
    const longParagraphs = bodyParagraphs.filter((p) => countWords(p) > LOCAL_PARAGRAPH_MAX_WORDS);

    const longSentenceCount = metrics?.longSentencesOver22 ?? longSentences.length;
    const longParagraphCount = metrics?.longParagraphsOver65 ?? longParagraphs.length;

    const samples = longSentences
      .slice(0, 5)
      .map((s) => `• "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}" (${countWords(s)} words)`);

    const longLines = [
      `Scorer counts: ${longSentenceCount} sentences >22 words (need ≤2), ${longParagraphCount} paragraphs >${LOCAL_PARAGRAPH_MAX_WORDS} words (need ≤1).`,
    ];
    if (samples.length > 0) {
      longLines.push('Split EVERY sentence below to ≤22 words (keep facts, split clauses):', ...samples);
    }

    const hardHits = metrics?.hardToReadSentenceHits ?? 0;
    const hardBlock = formatHardToReadSentenceAuditBlock({
      hits: hardHits,
      samples: metrics?.hardToReadSentenceSamples,
    });

    return {
      longSentenceCount,
      longParagraphCount,
      promptText: [longLines.join('\n'), hardBlock].filter(Boolean).join('\n\n'),
    };
  }

  private restoreSemrushResult(
    semrush: NonNullable<PersistedSeoCheckData['semrush']>,
    overall: number,
  ): SeoScore {
    return {
      overall,
      suggestions: semrush.suggestions ?? [],
      node: semrush.node,
      nodeLabel: semrush.nodeLabel,
      suggestionDetails: semrush.suggestionDetails,
      actionableIssues: semrush.actionableIssues,
      analysisSource: semrush.analysisSource,
      apiUrls: semrush.apiUrls,
      semrushCompetitorWordCount: semrush.semrushCompetitorWordCount,
      semrushCurrentWordCount: semrush.semrushCurrentWordCount,
      semrushReadabilityScore: semrush.semrushReadabilityScore,
      semrushEvaluationRoute: semrush.semrushEvaluationRoute,
      semrushEvaluationContentFingerprint: semrush.semrushEvaluationContentFingerprint,
      semrushTargetKeywords: semrush.semrushTargetKeywords,
      semrushRecommendedKeywords: semrush.semrushRecommendedKeywords,
      semrushMissingTargetKeywords: semrush.semrushMissingTargetKeywords,
      semrushMissingRecommendedKeywords: semrush.semrushMissingRecommendedKeywords,
      semrushCheckRecord: semrush.semrushCheckRecord,
    };
  }

  /** Semrush < 9.0 时：LLM 按侧栏改写 → 规则拆段 → 再终检（工作流与手动终检共用） */
  private async executeSemrushOptimizeRounds(
    ctx: LlmJobContext,
    input: {
      jobBriefData: unknown;
      serpData: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      initialContent: string;
      initialLocalResult: LocalSeoScoreResult;
      initialSemrushResult: SeoScore;
      seoCheck: PersistedSeoCheckData;
      recommendedKeywords: string[];
      optimizeHistory: OptimizeHistoryEntry[];
      semrushOptimizeRounds?: number;
      semrushRoundCap?: number;
      localOptimizeRounds?: number;
      preferredNodeKey?: string;
      calibrationRuntime?: ScoreCalibrationRuntime;
      calibrationShadowLog?: CalibrationShadowEntry[];
      scoreConfig: ResolvedSiteSeoScoreConfig;
      roundCapOptions?: { strictCap?: boolean };
    },
  ): Promise<{
    content: string;
    localResult: LocalSeoScoreResult;
    semrushResult: SeoScore;
    semrushOptimizeRounds: number;
    calibrationShadowLog: CalibrationShadowEntry[];
  }> {
    let currentContent = input.initialContent;
    let localResult = input.initialLocalResult;
    let semrushResult = input.initialSemrushResult;
    const calibrationShadowLog = [...(input.calibrationShadowLog ?? [])];
    let usedCalibrationProxy = semrushResult.calibrationProxy === true;
    let rpaSkippedCount = 0;
    let semrushOptimizeRounds =
      input.semrushOptimizeRounds ?? countOptimizeRounds(input.optimizeHistory, 'semrush');
    let bestSemrushScore = semrushResult.overall;
    let bestSemrushContent = currentContent;
    let bestSemrushResult = semrushResult;
    let bestLocalAtSemrush = localResult;
    let consecutiveSemrushRollbacks = 0;
    const scoreConfig = input.scoreConfig;
    const roundCapOptions = input.roundCapOptions;
    const isSemrushResume = (input.semrushOptimizeRounds ?? 0) > 0;
    const semrushRoundCap =
      input.semrushRoundCap ??
      resolveSemrushOptimizeRoundCap(
        bestSemrushScore,
        semrushOptimizeRounds,
        isSemrushResume,
        scoreConfig,
        roundCapOptions,
      );
    const localOptimizeRounds = input.localOptimizeRounds ?? 0;

    while (
      !semrushResult.skipped &&
      semrushResult.overall < scoreConfig.semrushPassThreshold &&
      semrushOptimizeRounds < semrushRoundCap
    ) {
      await this.assertSemrushWorkNotCancelled(ctx);

      const rewriteSuggestions = buildSemrushRewriteSuggestions(semrushResult, currentContent);
      const suggestionsForRound =
        rewriteSuggestions.length > 0
          ? rewriteSuggestions
          : buildFallbackSemrushSuggestions(semrushResult, currentContent);

      semrushOptimizeRounds += 1;
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: localResult.score,
        semrushScore: semrushResult.overall,
        message: `Semrush ${semrushResult.overall}/10，AI 按侧栏建议优化正文（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`,
      });
      this.logger.info('Semrush below threshold, rewriting draft with suggestions', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.semrush_optimize',
        round: semrushOptimizeRounds,
        score: semrushResult.overall,
        suggestionCount: suggestionsForRound.length,
        usedFallbackSuggestions: rewriteSuggestions.length === 0,
      });

      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
      );
      const protectedSeoPhrases = this.collectProtectedSeoPhrases(
        currentContent,
        ctx.targetKeyword,
        keywordsForAi,
      );
      currentContent = applySemrushSidebarComplexWordFixes(currentContent, semrushResult);

      const wordGap = computeSemrushWordGap(
        semrushResult.semrushCurrentWordCount,
        semrushResult.semrushCompetitorWordCount,
      );
      if (wordGap !== null && wordGap >= SEMRUSH_WORD_GAP_INJECT_MIN) {
        const injected = injectSemrushWordCountExpansion(
          currentContent,
          wordGap,
          ctx.targetKeyword,
        );
        currentContent = injected.content;
      }

      const semrushOptCtx = buildSemrushOptimizeContext(semrushResult, currentContent);
      const useSurgicalMode =
        isSemrushSurgicalTier(bestSemrushScore) ||
        isSemrushUltraNearMiss(bestSemrushScore) ||
        consecutiveSemrushRollbacks >= 2;
      const bestComplexWordHits = countSemrushComplexWordHits(bestSemrushContent);
      const bestHardSentenceHits = detectHardToReadSentences(bestSemrushContent).length;

      if (useSurgicalMode) {
        currentContent = applySemrushNearMissDeterministicFixes(currentContent);
        const surgicalInstruction =
          buildSemrushNearMissSurgicalInstruction(semrushResult, currentContent) ??
          (wordGap !== null && wordGap >= SEMRUSH_WORD_GAP_INJECT_MIN
            ? buildSemrushWordGapSurgicalInstruction(semrushResult, wordGap, ctx.targetKeyword)
            : null);

        if (surgicalInstruction) {
          await this.touchWorkflowProgress(ctx, {
            phase: 'semrush',
            round: semrushOptimizeRounds,
            maxRounds: semrushRoundCap,
            localScore: localResult.score,
            semrushScore: semrushResult.overall,
            message: `Semrush ${semrushResult.overall}/10，手术式改写（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`,
          });
          currentContent = await this.llmService.generateSemrushNearMissRewrite(
            ctx,
            currentContent,
            surgicalInstruction,
            {
              phase: 'semrush',
              round: semrushOptimizeRounds,
              semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
              scoreBefore: semrushResult.overall,
              localScore: localResult.score,
            },
          );
        } else {
          this.logger.info('Semrush surgical tier: no LLM target, skipping full rewrite', {
            traceId: ctx.traceId,
            jobId: ctx.jobId,
            action: 'seo_checker.semrush_surgical_skip_llm',
            round: semrushOptimizeRounds,
            score: semrushResult.overall,
          });
        }
      } else {
        currentContent = await this.llmService.generateOptimize(
          ctx,
          currentContent,
          suggestionsForRound,
          keywordsForAi,
          this.buildSemrushOptimizeMeta({
            round: semrushOptimizeRounds,
            semrushResult,
            localResult,
            semrushOptCtx,
            protectedSeoPhrases,
            scoreConfig,
          }),
        );
      }
      const semrushBoostTarget = resolveSemrushBoostWordTarget(
        semrushResult.semrushCompetitorWordCount,
        input.targetWordCount,
      );
      currentContent = boostLocalSeoContent(
        currentContent,
        buildSemrushBoostOptions(semrushBoostTarget, useSurgicalMode),
      );
      const structureFix = validateAndFixSemrushStructure(currentContent);
      currentContent = structureFix.content;
      const roundAudit = buildSemrushReadabilityAudit(currentContent);
      const bestAudit = buildSemrushReadabilityAudit(bestSemrushContent);
      const bestSubmittedKeywords =
        bestSemrushResult.semrushTargetKeywords ??
        buildSemrushSubmittedKeywords(bestSemrushContent, {
          targetKeyword: ctx.targetKeyword,
          poolKeywords: keywordsForAi,
        });
      const bestMissingKeywords = this.countSemrushMissingKeywords(
        bestSemrushContent,
        ctx.targetKeyword,
        bestSemrushResult,
        keywordsForAi,
        bestSubmittedKeywords,
      );
      const candidateLocal = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        input.serpData,
        input.targetWordCount,
        {
          competitorWordCount: semrushResult.semrushCompetitorWordCount,
        },
      );
      const semrushKeywords = this.mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
        candidateLocal.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
      );
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush-check',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: candidateLocal.score,
        semrushScore: semrushResult.overall,
        message: `第 ${semrushOptimizeRounds} 轮正文已更新，重新 Semrush 终检中…`,
      });
      await this.assertSemrushWorkNotCancelled(ctx);
      const semrushRpaInput = buildSemrushCheckInputFromContent(
        currentContent,
        ctx.targetKeyword,
        semrushKeywords,
      );

      const candidatePrediction = this.buildCalibrationPredictionForContent(
        input.calibrationRuntime ?? {
          shadowEnabled: false,
          reduceRpaEnabled: false,
          localAlignEnabled: false,
          localAlignEffective: false,
          model: null,
          featureMeans: null,
        },
        {
          localResult: candidateLocal,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: input.jobBriefData,
          serpData: input.serpData,
          targetWordCount: input.targetWordCount,
          semrushResult: bestSemrushResult,
          submittedKeywords: semrushRpaInput.submittedKeywords,
          missingKeywordCountOverride: this.countSemrushMissingKeywords(
            currentContent,
            ctx.targetKeyword,
            bestSemrushResult,
            semrushKeywords,
            semrushRpaInput.submittedKeywords,
          ),
        },
      );
      const recheckDecision =
        input.calibrationRuntime?.reduceRpaEnabled === true
          ? resolveSemrushRecheckDecision({
              model: input.calibrationRuntime.model,
              prediction: candidatePrediction,
              bestOverall: bestSemrushScore,
              candidateLocalScore: candidateLocal.score,
              semrushPassThreshold: input.scoreConfig.semrushPassThreshold,
              localAlignEffective: input.calibrationRuntime.localAlignEffective,
              candidatePredictedSemrush: candidatePrediction.predictedSemrush,
            })
          : ({ action: 'run_rpa' } as const);

      if (input.calibrationRuntime?.shadowEnabled) {
        calibrationShadowLog.push(
          createCalibrationShadowEntry({
            phase: 'pre_rpa',
            round: semrushOptimizeRounds,
            localScore: candidateLocal.score,
            prediction: candidatePrediction,
            decision: recheckDecision.action === 'run_rpa' ? undefined : recheckDecision,
          }),
        );
      }

      let candidateSemrush: SeoScore;
      let rpaRanThisRound = false;
      if (recheckDecision.action === 'skip_accept_proxy') {
        candidateSemrush = buildCalibrationProxyScore(
          bestSemrushResult,
          recheckDecision.predicted,
        );
        usedCalibrationProxy = true;
        rpaSkippedCount += 1;
        calibrationShadowLog.push(
          createCalibrationShadowEntry({
            phase: 'rpa_skipped',
            round: semrushOptimizeRounds,
            localScore: candidateLocal.score,
            prediction: candidatePrediction,
            decision: recheckDecision,
            rpaSkipped: true,
          }),
        );
        this.logger.info('Semrush RPA skipped (calibration accept proxy)', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.calibration_skip_rpa',
          round: semrushOptimizeRounds,
          predicted: recheckDecision.predicted,
        });
      } else if (recheckDecision.action === 'skip_reject') {
        candidateSemrush = buildCalibrationProxyScore(
          bestSemrushResult,
          recheckDecision.predicted,
        );
        rpaSkippedCount += 1;
        calibrationShadowLog.push(
          createCalibrationShadowEntry({
            phase: 'rpa_skipped',
            round: semrushOptimizeRounds,
            localScore: candidateLocal.score,
            prediction: candidatePrediction,
            decision: recheckDecision,
            rpaSkipped: true,
          }),
        );
        this.logger.info('Semrush RPA skipped (calibration predicted regression)', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.calibration_skip_rpa',
          round: semrushOptimizeRounds,
          predicted: recheckDecision.predicted,
          bestOverall: bestSemrushScore,
        });
      } else {
        candidateSemrush = await this.runSemrushCheck(
          { ...semrushRpaInput, preferredNodeKey: input.preferredNodeKey },
          ctx,
        );
        rpaRanThisRound =
          !candidateSemrush.skipped && candidateSemrush.calibrationProxy !== true;
        if (input.calibrationRuntime?.shadowEnabled && !candidateSemrush.skipped) {
          calibrationShadowLog.push(
            createCalibrationShadowEntry({
              phase: 'post_rpa',
              round: semrushOptimizeRounds,
              localScore: candidateLocal.score,
              prediction: candidatePrediction,
              actualSemrush: candidateSemrush.overall,
            }),
          );
        }
      }
      const rpaSnapshotContent = currentContent;
      const candidateMissingKeywords = this.countSemrushMissingKeywords(
        currentContent,
        ctx.targetKeyword,
        candidateSemrush,
        semrushKeywords,
        semrushRpaInput.submittedKeywords,
      );
      const readabilityImproved =
        roundAudit.longParagraphCount < bestAudit.longParagraphCount ||
        roundAudit.longSentenceCount < bestAudit.longSentenceCount;
      const accepted = shouldAcceptSemrushCandidate(
        {
          candidateOverall: candidateSemrush.overall,
          bestOverall: bestSemrushScore,
          candidateMissingKeywordCount: candidateMissingKeywords,
          bestMissingKeywordCount: bestMissingKeywords,
          readabilityImproved,
          candidateComplexWordHits: countSemrushComplexWordHits(currentContent),
          bestComplexWordHits,
          candidateHardSentenceHits: detectHardToReadSentences(currentContent).length,
          bestHardSentenceHits,
        },
        scoreConfig,
      );
      this.logger.info('Semrush optimize round metrics', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.semrush_round_metrics',
        round: semrushOptimizeRounds,
        semrushScore: candidateSemrush.overall,
        bestSemrushScore,
        wordGap:
          typeof candidateSemrush.semrushCompetitorWordCount === 'number' &&
          typeof candidateSemrush.semrushCurrentWordCount === 'number'
            ? candidateSemrush.semrushCompetitorWordCount -
              candidateSemrush.semrushCurrentWordCount
            : undefined,
        missingKeywords: candidateMissingKeywords,
        longParagraphs: roundAudit.longParagraphCount,
        longSentences: roundAudit.longSentenceCount,
        structureErrors: detectSemrushStructureErrors(currentContent).length,
        structureFixed: structureFix.fixed,
        rolledBack: !accepted,
      });
      if (accepted) {
        consecutiveSemrushRollbacks = 0;
        bestSemrushScore = candidateSemrush.overall;
        bestSemrushContent = currentContent;
        bestSemrushResult = candidateSemrush;
        bestLocalAtSemrush = candidateLocal;
        semrushResult = candidateSemrush;
        localResult = candidateLocal;
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'semrush', round: semrushOptimizeRounds },
          {
            scoreAfter: semrushResult.overall,
            localScoreAfter: localResult.score,
          },
        );
      } else {
        consecutiveSemrushRollbacks += 1;
        await this.llmService.revertDraftContent(ctx, bestSemrushContent);
        currentContent = bestSemrushContent;
        semrushResult = bestSemrushResult;
        localResult = bestLocalAtSemrush;
        this.logger.warn('Semrush optimize rolled back to best version', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.semrush_optimize_rollback',
          round: semrushOptimizeRounds,
          candidateSemrush: candidateSemrush.overall,
          candidateLocal: candidateLocal.score,
          bestSemrush: bestSemrushScore,
          bestLocal: bestLocalAtSemrush.score,
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'semrush', round: semrushOptimizeRounds },
          {
            scoreAfter: bestSemrushScore,
            localScoreAfter: bestLocalAtSemrush.score,
            rolledBack: true,
            candidateScoreAfter: candidateSemrush.overall,
            candidateLocalScoreAfter: candidateLocal.score,
            rollbackReason: 'score_regressed',
          },
        );
      }
      await this.persistSemrushProgress(ctx, {
        localResult: bestLocalAtSemrush,
        semrushResult: bestSemrushResult,
        localOptimizeRounds,
        semrushOptimizeRounds,
        content: bestSemrushContent,
        existingSeoCheck: input.seoCheck,
        recommendedKeywords: input.recommendedKeywords,
        targetKeyword: ctx.targetKeyword,
        scoreConfig,
        rpaSnapshot: rpaRanThisRound
          ? {
              content: rpaSnapshotContent,
              localResult: candidateLocal,
              semrushResult: candidateSemrush,
              rolledBack: !accepted,
            }
          : undefined,
      });
    }

    if (
      usedCalibrationProxy &&
      bestSemrushResult.calibrationProxy &&
      !bestSemrushResult.skipped &&
      input.calibrationRuntime?.reduceRpaEnabled === true
    ) {
      const confirmKeywords = this.mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
        bestLocalAtSemrush.recommendedKeywords,
        ctx.targetKeyword,
        bestSemrushResult.semrushRecommendedKeywords,
      );
      const confirmInput = buildSemrushCheckInputFromContent(
        bestSemrushContent,
        ctx.targetKeyword,
        confirmKeywords,
      );
      this.logger.info('Confirmatory Semrush RPA after calibration proxy', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.calibration_confirm_rpa',
        proxyScore: bestSemrushResult.overall,
        rpaSkippedCount,
      });
      const confirmed = await this.runSemrushCheck(
        { ...confirmInput, preferredNodeKey: input.preferredNodeKey },
        ctx,
      );
      if (!confirmed.skipped) {
        bestSemrushResult = confirmed;
        bestSemrushScore = confirmed.overall;
        semrushResult = confirmed;
        await this.appendSemrushRpaSnapshot(ctx, {
          content: bestSemrushContent,
          targetKeyword: ctx.targetKeyword,
          recommendedKeywords: confirmKeywords,
          semrushResult: confirmed,
          localResult: bestLocalAtSemrush,
          round: semrushOptimizeRounds,
        });
        if (input.calibrationRuntime.shadowEnabled) {
          const confirmPrediction = this.buildCalibrationPredictionForContent(
            input.calibrationRuntime,
            {
              localResult: bestLocalAtSemrush,
              targetKeyword: ctx.targetKeyword,
              content: bestSemrushContent,
              jobBriefData: input.jobBriefData,
              serpData: input.serpData,
              targetWordCount: input.targetWordCount,
              semrushResult: confirmed,
              submittedKeywords: confirmInput.submittedKeywords,
            },
          );
          calibrationShadowLog.push(
            createCalibrationShadowEntry({
              phase: 'post_rpa',
              localScore: bestLocalAtSemrush.score,
              prediction: confirmPrediction,
              actualSemrush: confirmed.overall,
            }),
          );
        }
      }
    }

    return {
      content: bestSemrushContent,
      localResult: bestLocalAtSemrush,
      semrushResult: bestSemrushResult,
      semrushOptimizeRounds,
      calibrationShadowLog,
    };
  }

  private async loadCalibrationRuntime(
    ctx: LlmJobContext,
    siteId: string,
  ): Promise<ScoreCalibrationRuntime> {
    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
      },
      select: { settings: true },
    });
    const workflow = parseSiteWorkflowSettings(site?.settings);
    const { model, featureMeans } = await this.scoreCalibrationService.loadProjectCalibration(
      ctx.organizationId,
      ctx.projectId,
    );
    const localAlignEnabled = workflow.scoreCalibrationLocalAlign === true;
    const localAlignEffective = resolveLocalAlignEffective({ localAlignEnabled, model });
    return {
      shadowEnabled: workflow.scoreCalibrationShadow !== false,
      reduceRpaEnabled: workflow.scoreCalibrationReduceRpa === true,
      localAlignEnabled,
      localAlignEffective,
      model,
      featureMeans: featureMeans ?? null,
    };
  }

  /** 本地进门闸：legacy 用 0–100，calibrated 用预测 Semrush 0–10 */
  private buildLocalGateEvaluation(
    calibrationRuntime: ScoreCalibrationRuntime,
    localGate: LocalGateContext,
    input: {
      localResult: LocalSeoScoreResult;
      targetKeyword: string;
      content: string;
      jobBriefData?: unknown;
      serpData?: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      poolKeywords?: string[];
      submittedKeywords?: string[];
      semrushResult?: SeoScore;
      missingKeywordCountOverride?: number;
      articleTitle?: string;
    },
  ): {
    prediction: ScoreCalibrationPrediction | null;
    gateScore: number;
    passed: boolean;
    pointsToGo: number;
  } {
    const prediction =
      localGate.mode === 'calibrated'
        ? this.buildCalibrationPredictionForContent(calibrationRuntime, {
            localResult: input.localResult,
            targetKeyword: input.targetKeyword,
            content: input.content,
            jobBriefData: input.jobBriefData,
            serpData: input.serpData,
            targetWordCount: input.targetWordCount,
            poolKeywords: input.poolKeywords,
            submittedKeywords: input.submittedKeywords,
            semrushResult: input.semrushResult,
            missingKeywordCountOverride: input.missingKeywordCountOverride,
            articleTitle: input.articleTitle,
          })
        : null;
    const gateScore =
      localGate.mode === 'calibrated' && prediction
        ? prediction.predictedSemrush
        : input.localResult.score;
    return {
      prediction,
      gateScore,
      passed: isLocalGatePassed({
        gate: localGate,
        localScore: input.localResult.score,
        prediction,
      }),
      pointsToGo: localGatePointsToGo({
        gate: localGate,
        localScore: input.localResult.score,
        prediction,
      }),
    };
  }

  /** M6 流水线结束时写入 contentScore 快照 */
  private buildPipelineContentScoreSnapshot(input: {
    ctx: LlmJobContext;
    content: string;
    localResult: LocalSeoScoreResult;
    semrushResult: SeoScore;
    calibrationRuntime: ScoreCalibrationRuntime;
    targetWordCount: number;
    submittedKeywords: string[];
    missingKeywordCount: number;
  }): ContentScoreSnapshot {
    const scored = scoreArticleContentFromLocal({
      localResult: input.localResult,
      targetKeyword: input.ctx.targetKeyword,
      content: input.content,
      submittedKeywords: input.submittedKeywords,
      targetWordCount: input.targetWordCount,
      competitorWordCount: input.semrushResult.semrushCompetitorWordCount,
      priorSemrushNode: input.semrushResult.nodeLabel ?? input.semrushResult.node,
      model: input.calibrationRuntime.model,
      featureMeans: input.calibrationRuntime.featureMeans,
      missingKeywordCountOverride: input.missingKeywordCount,
    });
    return buildContentScoreSnapshot(scored, {
      content: input.content,
      source: input.semrushResult.calibrationProxy ? 'm6_proxy' : 'm6_pipeline',
    });
  }

  /** M6 校准预测：与改稿 content-score 同源 */
  private buildCalibrationPredictionForContent(
    calibrationRuntime: ScoreCalibrationRuntime,
    input: {
      localResult: LocalSeoScoreResult;
      targetKeyword: string;
      content: string;
      jobBriefData?: unknown;
      serpData?: { organic?: SerpOrganicRow[] } | null;
      targetWordCount?: number;
      semrushResult?: SeoScore;
      poolKeywords?: string[];
      submittedKeywords?: string[];
      missingKeywordCountOverride?: number;
      articleTitle?: string;
    },
  ): ScoreCalibrationPrediction {
    const resolvedKeywords = resolveSubmittedKeywords({
      targetKeyword: input.targetKeyword,
      submittedKeywords:
        input.submittedKeywords ??
        (input.poolKeywords
          ? buildSemrushSubmittedKeywords(input.content, {
              targetKeyword: input.targetKeyword,
              poolKeywords: input.poolKeywords,
            })
          : undefined),
      briefRecommended: extractBriefRecommendedKeywords(input.jobBriefData),
      semrushSubmitted: input.semrushResult?.semrushTargetKeywords,
      semrushRecommended: input.semrushResult?.semrushRecommendedKeywords,
    });

    return buildCalibrationPrediction({
      localResult: input.localResult,
      model: calibrationRuntime.model,
      featureMeans: calibrationRuntime.featureMeans,
      targetKeyword: input.targetKeyword,
      content: input.content,
      submittedKeywords: resolvedKeywords,
      targetWordCount: input.targetWordCount,
      competitorWordCount: input.semrushResult?.semrushCompetitorWordCount,
      priorSemrushNode: input.semrushResult?.nodeLabel ?? input.semrushResult?.node,
      missingKeywordCountOverride: input.missingKeywordCountOverride,
      articleTitle: input.articleTitle,
    });
  }

  private async runSemrushCheck(input: SeoCheckInput, ctx: LlmJobContext): Promise<SeoScore> {
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

    this.logger.info('Semrush RPA keyword plan', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.semrush_keyword_plan',
      submittedCount: resolved.submittedKeywords?.length ?? 0,
      submittedKeywords: resolved.submittedKeywords,
    });

    const result = await this.semrushQueue.runCheck(resolved, {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
    });

    await persistSemrushQueueCheckpoint(
      this.prisma,
      ctx.jobId,
      result,
      input.content,
      this.logger,
    );

    return result;
  }

  private resolvePersistedSubmittedKeywords(
    content: string,
    targetKeyword: string,
    poolKeywords: string[],
    semrushResult?: SeoScore,
  ): string[] {
    if (semrushResult?.semrushTargetKeywords && semrushResult.semrushTargetKeywords.length > 0) {
      return semrushResult.semrushTargetKeywords;
    }
    return buildSemrushSubmittedKeywords(content, {
      targetKeyword,
      poolKeywords,
    });
  }

  private async runForcedLocalRefresh(
    ctx: LlmJobContext,
    input: {
      briefData: unknown;
      currentContent: string;
      localResult: LocalSeoScoreResult;
      serpData: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      optimizeRounds: number;
      reason?: 'gsc_underperform' | 'manual';
      scoreConfig: ResolvedSiteSeoScoreConfig;
      calibrationRuntime: ScoreCalibrationRuntime;
      articleTitle?: string;
    },
  ): Promise<{
    content: string;
    localResult: LocalSeoScoreResult;
    optimizeRounds: number;
  }> {
    const forcedCap = 2;
    const scoreConfig = input.scoreConfig;
    const localGate = resolveLocalGateContext({
      localAlignEnabled: input.calibrationRuntime.localAlignEnabled,
      localAlignEffective: input.calibrationRuntime.localAlignEffective,
      scoreConfig,
    });
    let currentContent = input.currentContent;
    let localResult = input.localResult;
    let optimizeRounds = input.optimizeRounds;
    let bestContent = currentContent;
    let bestResult = localResult;
    let bestGateScore = this.buildLocalGateEvaluation(
      input.calibrationRuntime,
      localGate,
      {
        localResult: bestResult,
        targetKeyword: ctx.targetKeyword,
        content: bestContent,
        jobBriefData: input.briefData,
        serpData: input.serpData,
        targetWordCount: input.targetWordCount,
        articleTitle: input.articleTitle,
      },
    ).gateScore;
    let bestPredictedSemrush =
      localGate.mode === 'calibrated' ? bestGateScore : 0;

    const extraHints =
      input.reason === 'gsc_underperform' ? GSC_UNDERPERFORM_OPTIMIZE_HINTS : [];

    for (let round = 1; round <= forcedCap; round++) {
      optimizeRounds += 1;
      const gateEvaluation = this.buildLocalGateEvaluation(
        input.calibrationRuntime,
        localGate,
        {
          localResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: input.briefData,
          serpData: input.serpData,
          targetWordCount: input.targetWordCount,
          articleTitle: input.articleTitle,
        },
      );
      await this.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: optimizeRounds,
        localScore: localResult.score,
        message: `针对性优化正文中（第 ${round}/${forcedCap} 轮，搜索表现刷新）…`,
      });

      const localOptCtx = this.buildLocalOptimizeContext(
        localResult,
        currentContent,
        scoreConfig,
        localGate,
        gateEvaluation.prediction,
        { targetKeyword: ctx.targetKeyword, articleTitle: input.articleTitle },
      );
      const suggestions = [...new Set([...localOptCtx.suggestions, ...extraHints])];
      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        input.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
      );

      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        suggestions,
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
          localScoreBreakdown: this.formatLocalScoreBreakdown(localResult),
          focusDimensions: formatFocusDimensions(localResult.breakdown),
          readabilityPriority: localOptCtx.readabilityPriority,
          serpPriority: localOptCtx.serpPriority,
          fleschPriority: localOptCtx.fleschPriority,
          hardSentencePriority: localOptCtx.hardSentencePriority,
          titlePriority: localOptCtx.titlePriority,
          articleTitle: localOptCtx.resolvedTitle,
          readabilityAudit: localOptCtx.readabilityAudit,
          pointsToGo: localOptCtx.pointsToGo,
          scoreGapPlan: localOptCtx.scoreGapPlan,
          contentCoverageMaxed: localOptCtx.contentCoverageMaxed,
          serpCoverageMaxed: localOptCtx.serpCoverageMaxed,
          keywordDensityFocus: localOptCtx.keywordDensityFocus,
          protectedSeoPhrases: this.collectProtectedSeoPhrases(
            currentContent,
            ctx.targetKeyword,
            keywordsForAi,
          ),
        },
      );

      currentContent = boostLocalSeoContent(currentContent, { targetWordCount: input.targetWordCount });
      const candidateResult = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        input.serpData,
        input.targetWordCount,
      );
      const candidateGateEvaluation = this.buildLocalGateEvaluation(
        input.calibrationRuntime,
        localGate,
        {
          localResult: candidateResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: input.briefData,
          serpData: input.serpData,
          targetWordCount: input.targetWordCount,
          articleTitle: input.articleTitle,
        },
      );
      const nearMiss = isLocalGateNearMiss({ gate: localGate, bestGateScore });
      const longSentencesImproved =
        candidateResult.metrics.longSentencesOver22 <= 2 &&
        candidateResult.metrics.longSentencesOver22 <
          (bestResult.metrics.longSentencesOver22 ?? Number.MAX_SAFE_INTEGER);
      const longParagraphsImproved =
        candidateResult.metrics.longParagraphsOver65 <= 1 &&
        candidateResult.metrics.longParagraphsOver65 <
          (bestResult.metrics.longParagraphsOver65 ?? Number.MAX_SAFE_INTEGER);
      const improved = shouldAcceptLocalGateCandidate({
        gate: localGate,
        candidateLocalScore: candidateResult.score,
        bestLocalScore: bestResult.score,
        candidatePredicted: candidateGateEvaluation.gateScore,
        bestPredicted: bestPredictedSemrush,
        candidateKeywordCoverage: candidateResult.breakdown.keywordCoverage,
        bestKeywordCoverage: bestResult.breakdown.keywordCoverage,
        nearMiss,
        readabilityImproved: longSentencesImproved || longParagraphsImproved,
        candidateFlesch: candidateResult.metrics.fleschReadingEase,
        bestFlesch: bestResult.metrics.fleschReadingEase,
        candidateSerpAlignment: candidateResult.breakdown.serpTermAlignment,
        bestSerpAlignment: bestResult.breakdown.serpTermAlignment,
      });
      if (improved) {
        bestResult = candidateResult;
        bestContent = currentContent;
        localResult = candidateResult;
        bestGateScore = candidateGateEvaluation.gateScore;
        bestPredictedSemrush = candidateGateEvaluation.gateScore;
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
        await this.llmService.revertDraftContent(ctx, bestContent);
        currentContent = bestContent;
        localResult = bestResult;
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          {
            scoreAfter: bestResult.score,
            breakdownAfter: bestResult.breakdown,
            rolledBack: true,
            candidateScoreAfter: candidateResult.score,
            predictedSemrushAfter:
              localGate.mode === 'calibrated' ? bestPredictedSemrush : undefined,
            candidatePredictedSemrush:
              localGate.mode === 'calibrated'
                ? candidateGateEvaluation.prediction?.predictedSemrush
                : undefined,
            rollbackReason:
              localGate.mode === 'calibrated'
                ? 'predicted_semrush_regressed'
                : 'score_regressed',
          },
        );
      }
    }

    return { content: bestContent, localResult: bestResult, optimizeRounds };
  }

  private evaluateLocal(
    keyword: string,
    content: string,
    serpData: { organic?: SerpOrganicRow[] } | null,
    targetWordCount: number,
    semrushHints?: {
      readabilityTarget?: number;
      competitorWordCount?: number;
    },
  ): LocalSeoScoreResult {
    return scoreLocalSeo({
      keyword,
      content,
      serpOrganic: serpData?.organic,
      targetWordCount,
      readabilityTarget: semrushHints?.readabilityTarget,
      competitorWordCount: semrushHints?.competitorWordCount,
    });
  }

  private collectProtectedSeoPhrases(
    content: string,
    targetKeyword: string,
    recommendedKeywords: string[],
  ): string[] {
    return collectPresentSeoPhrases(content, [targetKeyword, ...recommendedKeywords]);
  }

  private countSemrushMissingKeywords(
    content: string,
    targetKeyword: string,
    semrushResult: SeoScore,
    extraKeywords?: string[],
    submittedKeywords?: string[],
  ): number {
    const all =
      submittedKeywords && submittedKeywords.length > 0
        ? submittedKeywords
        : mergeSemrushKeywordLists(
            [targetKeyword],
            semrushResult.semrushTargetKeywords,
            semrushResult.semrushRecommendedKeywords,
            extraKeywords,
          );
    return findMissingSemrushKeywords(content, all).length;
  }

  private buildSemrushOptimizeMeta(
    input: {
      round: number;
      semrushResult: SeoScore;
      localResult: LocalSeoScoreResult;
      semrushOptCtx: ReturnType<typeof buildSemrushOptimizeContext>;
      protectedSeoPhrases: string[];
      scoreConfig: ResolvedSiteSeoScoreConfig;
    },
  ): GenerateOptimizeMeta {
    return {
      phase: 'semrush',
      round: input.round,
      semrushEvaluationRoute: input.semrushResult.semrushEvaluationRoute,
      scoreBefore: input.semrushResult.overall,
      semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
      semrushCurrentWordCount: input.semrushResult.semrushCurrentWordCount,
      semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
      localScore: input.localResult.score,
      localScoreTarget: input.scoreConfig.localPassThreshold,
      localScoreBreakdown: this.formatLocalScoreBreakdown(input.localResult),
      focusDimensions: formatFocusDimensions(input.localResult.breakdown),
      readabilityPriority: input.semrushOptCtx.readabilityPriority,
      readabilityAudit: input.semrushOptCtx.readabilityAudit,
      pointsToGo: input.semrushOptCtx.pointsToGo,
      scoreGapPlan: input.semrushOptCtx.scoreGapPlan,
      protectedSeoPhrases: input.protectedSeoPhrases,
    };
  }

  private formatLocalScoreBreakdown(result: LocalSeoScoreResult): string {
    const b = result.breakdown;
    const lines = [
      `当前总分 ${result.score}/100`,
      `- 关键词 ${b.keywordCoverage}/25（开篇含词 + 动态密度 + H2 模糊匹配）`,
      `- SERP 词 ${b.serpTermAlignment}/25（已对齐 ${result.metrics.matchedSerpTerms}/${result.metrics.totalSerpTerms}）`,
      `- 结构 ${b.structure}/20（H2≥4 + 篇幅 70–105% + 列表）`,
      `- 可读性 ${b.readability}/20（≤65 词/段、≤22 词/句、少被动）`,
      `- 深度 ${b.contentDepth}/10（≥700 词 + 术语丰富）`,
    ];
    if (result.recommendedKeywords.length > 0) {
      lines.push(`- 尚未覆盖的 SERP 词（语境化融合）：${result.recommendedKeywords.slice(0, 12).join('、')}`);
    }
    return lines.join('\n');
  }
}
