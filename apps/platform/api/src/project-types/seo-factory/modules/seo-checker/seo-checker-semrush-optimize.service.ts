/**
 * SEO 查分：Semrush 多轮 LLM 优化循环。
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../../core/logger/logger.service';
import { LlmService, type LlmJobContext } from '../llm/llm.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerRpaService } from './seo-checker-rpa.service';
import type { LocalSeoScoreResult } from '@wm/shared-core';
import type { SeoScore } from '@wm/provider-interfaces';
import type { ResolvedSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import type { LocalGateContext } from '../../utils/score-calibration-local-align.util';
import type { CalibrationShadowEntry, ScoreCalibrationRuntime } from '../../utils/score-calibration-runtime.util';
import type { OptimizeHistoryEntry, PersistedSeoCheckData, SemrushPlanningFeedback, SerpOrganicRow } from './seo-checker.types';
import {
  evaluateLocal,
  collectProtectedSeoPhrases,
  buildSemrushOptimizeMeta,
  flowCtx,
} from './seo-checker-scoring.util';
import { mergeRecommendedKeywordsForWriting } from './seo-checker-keywords.util';
import { buildCalibrationPredictionForContent } from './seo-checker-gate.util';
import {
  extractSemrushPlanningFeedback,
  mergeSemrushPlanningFeedbackState,
  mergeSemrushPlanningFeedback,
} from './seo-checker-semrush-feedback.util';
import { SEMRUSH_WORD_GAP_INJECT_MIN } from '../../constants/seo-score';
import { countOptimizeRounds, resolveSemrushOptimizeRoundCap, isSemrushSurgicalTier } from '../../utils/seo-pipeline.util';
import { flowWordCount, logSeoPipelineFlow, summarizeFlowKeywords } from '../../utils/seo-pipeline-flow-log.util';
import {
  buildSemrushBoostOptions,
  buildSemrushOptimizeContext,
  buildFallbackSemrushSuggestions,
  buildSemrushRewriteSuggestions,
  evaluateSemrushRoundOutput,
  repairSemrushRoundOutput,
  resolveSemrushBoostWordTarget,
  buildSemrushReadabilityAudit,
} from '../../utils/semrush-optimize.util';
import {
  applySemrushNearMissDeterministicFixes,
  applySemrushSidebarComplexWordFixes,
  buildSemrushNearMissSurgicalInstruction,
  buildSemrushWordGapSurgicalInstruction,
  isSemrushUltraNearMiss,
} from '../../utils/semrush-near-miss.util';
import {
  buildContextualKeywordWeavingInstruction,
  enrichSemrushKeywordCoverage,
  mergeSemrushKeywordLists,
  resolveAllSemrushMissingKeywordsForRound,
} from '../../providers/semrush/semrush-keyword-coverage.util';
import { extractBriefEntities, resolveKeywordCoverageManifest } from '../../utils/keyword-coverage-manifest.util';
import {
  applySemrushCasualToneFixes,
  applySemrushPassiveVoiceLightFixes,
  injectSemrushWordCountExpansion,
  buildSemrushWordCountPlan,
  boostLocalSeoContent,
  validateAndFixSemrushStructure,
  countSemrushComplexWordHits,
  detectHardToReadSentences,
  detectSemrushStructureErrors,
} from '@wm/shared-core';
import { buildSemrushSubmittedKeywords, sanitizeSemrushSubmittedKeywords, buildSemrushCheckInputFromContent } from '../../providers/semrush/semrush-submitted-keywords.util';
import {
  createCalibrationShadowEntry,
  resolveSemrushRecheckDecision,
  buildCalibrationProxyScore,
} from '../../utils/score-calibration-runtime.util';
import { decideSemrushCandidateAcceptance } from '../../utils/seo-pipeline.util';
import { buildLocalGateEvaluation } from './seo-checker-gate.util';
import { buildLocalGatePersistedFields } from '../../utils/score-calibration-local-align.util';
import {
  countSemrushMissingKeywords,
  countSemrushMissingSubmittedKeywords,
} from './seo-checker-scoring.util';

@Injectable()
export class SeoCheckerSemrushOptimizeService {
  constructor(
    private readonly llmService: LlmService,
    private readonly logger: LoggerService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly rpaService: SeoCheckerRpaService,
  ) {}

  async executeSemrushOptimizeRounds(
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
      localGate: LocalGateContext;
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
    const frozenLocalResult = input.initialLocalResult;
    const frozenLocalScore = frozenLocalResult.score;
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
    const stableSemrushSubmittedKeywords = sanitizeSemrushSubmittedKeywords(
      semrushResult.semrushTargetKeywords?.length
        ? semrushResult.semrushTargetKeywords
        : input.seoCheck.semrush?.submittedKeywords?.length
          ? input.seoCheck.semrush.submittedKeywords
          : buildSemrushSubmittedKeywords(currentContent, {
              targetKeyword: ctx.targetKeyword,
              poolKeywords: input.recommendedKeywords,
            }),
    );
    let semrushPlanningFeedback: SemrushPlanningFeedback = {
      ...extractSemrushPlanningFeedback(semrushResult),
      semrushTargetKeywords: stableSemrushSubmittedKeywords,
    };
    let consecutiveSemrushRollbacks = 0;
    const scoreConfig = input.scoreConfig;
    const roundCapOptions = input.roundCapOptions;
    const isSemrushResume = semrushOptimizeRounds > 0;
    const skipSurgicalDueToStaleNearMiss =
      isSemrushResume &&
      isSemrushSurgicalTier(bestSemrushScore) &&
      semrushOptimizeRounds >= 4;
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

    while (!semrushResult.skipped && semrushOptimizeRounds < semrushRoundCap) {
      if (semrushResult.overall >= scoreConfig.semrushPassThreshold) {
        break;
      }

      await this.rpaService.assertSemrushWorkNotCancelled(ctx);

      const planningSemrushResult = mergeSemrushPlanningFeedback(
        semrushResult,
        semrushPlanningFeedback,
      );
      const rewriteSuggestions = buildSemrushRewriteSuggestions(
        planningSemrushResult,
        currentContent,
      );
      const suggestionsForRoundBase =
        rewriteSuggestions.length > 0
          ? rewriteSuggestions
          : buildFallbackSemrushSuggestions(planningSemrushResult, currentContent);

      semrushOptimizeRounds += 1;
      const roundSubmittedKeywords = stableSemrushSubmittedKeywords;
      semrushResult = enrichSemrushKeywordCoverage(planningSemrushResult, currentContent, {
        submittedKeywords: roundSubmittedKeywords,
        targetKeyword: ctx.targetKeyword,
      });
      semrushPlanningFeedback = mergeSemrushPlanningFeedbackState(
        semrushPlanningFeedback,
        semrushResult,
      );
      if (semrushResult.overall >= bestSemrushScore) {
        bestSemrushResult = semrushResult;
      }
      const keywordsForAi = mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
        { semrushResult, content: currentContent },
      );
      const protectedSeoPhrases = collectProtectedSeoPhrases(
        currentContent,
        ctx.targetKeyword,
        keywordsForAi,
      );
      currentContent = applySemrushSidebarComplexWordFixes(currentContent, semrushResult);
      currentContent = applySemrushCasualToneFixes(currentContent);
      currentContent = applySemrushPassiveVoiceLightFixes(currentContent);

      const wordPlan = buildSemrushWordCountPlan({
        content: currentContent,
        competitorWordCount: semrushResult.semrushCompetitorWordCount,
        apiReportedWords: semrushResult.semrushCurrentWordCount,
      });
      if (wordPlan.localExpandGap >= SEMRUSH_WORD_GAP_INJECT_MIN) {
        const injected = injectSemrushWordCountExpansion(
          currentContent,
          wordPlan.localExpandGap,
          ctx.targetKeyword,
        );
        currentContent = injected.content;
      }

      const semrushOptCtx = buildSemrushOptimizeContext(semrushResult, currentContent);
      const keywordManifest = resolveKeywordCoverageManifest({
        content: currentContent,
        targetKeyword: ctx.targetKeyword,
        semrushActive: true,
        semrushResult,
        localMissingKeywords: localResult.recommendedKeywords,
        briefEntities: extractBriefEntities(input.jobBriefData),
      });
      const keywordBatch = resolveAllSemrushMissingKeywordsForRound({
        content: currentContent,
        semrushResult,
        manifest: keywordManifest,
        submittedKeywords: roundSubmittedKeywords,
        targetKeyword: ctx.targetKeyword,
      });
      const hasKeywordGap = keywordBatch.length > 0;
      const needsWordExpand = semrushOptCtx.wordCountExpandPriority === true;
      const dualKeywordAndExpand = hasKeywordGap && needsWordExpand;
      const keywordWeavingForRound = hasKeywordGap
        ? buildContextualKeywordWeavingInstruction(keywordBatch)
        : '';
      const suggestionsForRound = hasKeywordGap
        ? dualKeywordAndExpand
          ? [
              keywordWeavingForRound,
              `[SEO·关键词·必做] 本轮须融入全部 ${keywordBatch.length} 条缺失 SWA 推荐词（${keywordBatch.join('、')}）；与篇幅扩写同时进行，禁止为压字数删掉含推荐词的句子。`,
              ...suggestionsForRoundBase,
            ].filter(Boolean)
          : [
              keywordWeavingForRound,
              `[SEO·关键词+侧栏·必做] 本轮须融入全部 ${keywordBatch.length} 条缺失 SWA 推荐词（${keywordBatch.join('、')}）；同时处理侧栏可读性、语气、原创性建议；禁止改变 Semrush 目标关键词表。`,
              ...suggestionsForRoundBase,
            ].filter(Boolean)
      : suggestionsForRoundBase;
      const keywordsForRound = hasKeywordGap
        ? mergeSemrushKeywordLists(keywordBatch, keywordsForAi)
        : keywordsForAi;
      const semrushOptCtxForRound = hasKeywordGap
        ? dualKeywordAndExpand
          ? {
              ...semrushOptCtx,
              scoreGapPlan: `Weave ALL ${keywordBatch.length} missing SWA terms (${keywordBatch.join(', ')}) while expanding toward ${wordPlan.localExpandTarget ?? 'benchmark +5%'} words. Do not trim body copy.`,
          }
        : {
            ...semrushOptCtx,
            wordCountExpandPriority: false,
            scoreGapPlan: `Weave ALL ${keywordBatch.length} missing SWA recommended terms (${keywordBatch.join(', ')}) without changing submitted Semrush target keywords. Also complete sidebar readability, tone, and originality fixes from suggestions; do not treat this as a keyword-only round.`,
          }
      : semrushOptCtx;
      const nearMissTier =
        isSemrushSurgicalTier(bestSemrushScore) || isSemrushUltraNearMiss(bestSemrushScore);
      const useSurgicalMode =
        nearMissTier && consecutiveSemrushRollbacks < 2 && !skipSurgicalDueToStaleNearMiss;
      const forceKeywordFirst = hasKeywordGap;
      const blockSurgicalForWordPlan =
        needsWordExpand || semrushOptCtx.wordCountTrimPriority === true;
      const runSurgicalThisRound =
        useSurgicalMode && !forceKeywordFirst && !blockSurgicalForWordPlan;
      const roundAction = forceKeywordFirst
        ? dualKeywordAndExpand
          ? 'seo_checker.semrush_keyword_and_expand'
          : 'seo_checker.semrush_keyword_first'
        : runSurgicalThisRound
          ? 'seo_checker.semrush_surgical'
          : 'seo_checker.semrush_optimize';
      const roundMessage = forceKeywordFirst
        ? dualKeywordAndExpand
          ? `Semrush ${semrushResult.overall}/10，融合缺失推荐词（${keywordBatch.length} 条）并扩写（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`
          : `Semrush ${semrushResult.overall}/10，一次性融合全部缺失推荐词（${keywordBatch.length} 条，第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`
        : runSurgicalThisRound
          ? `Semrush ${semrushResult.overall}/10，手术式改写（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`
          : `Semrush ${semrushResult.overall}/10，AI 按侧栏建议优化正文（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`;
      await this.progressService.touchWorkflowProgress(ctx, {
        phase: 'semrush',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: frozenLocalScore,
        semrushScore: semrushResult.overall,
        message: roundMessage,
      });
      this.logger.info('Semrush round planning', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: roundAction,
        round: semrushOptimizeRounds,
        score: semrushResult.overall,
        suggestionCount: suggestionsForRound.length,
        usedFallbackSuggestions: rewriteSuggestions.length === 0,
        keywordGapCount: keywordManifest.missing.length,
        keywordBatchCount: keywordBatch.length,
        keywordBatch,
      });
      logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_round_plan', {
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        semrushScore: semrushResult.overall,
        roundAction,
        runSurgicalThisRound,
        forceKeywordFirst,
        dualKeywordAndExpand,
        needsWordExpand,
        keywordBatchCount: keywordBatch.length,
        keywordBatch: summarizeFlowKeywords(keywordBatch),
        keywordsForRound: summarizeFlowKeywords(keywordsForRound),
        keywordManifestMissing: summarizeFlowKeywords(keywordManifest.missing),
        consecutiveSemrushRollbacks,
        nearMissTier,
        skipSurgicalDueToStaleNearMiss,
        blockSurgicalForWordPlan,
        readabilityPriority: semrushOptCtxForRound.readabilityPriority,
        wordCountExpandPriority: semrushOptCtxForRound.wordCountExpandPriority,
        wordCountTrimPriority: semrushOptCtxForRound.wordCountTrimPriority,
        swaGap: wordPlan.swaGap,
        localExpandTarget: wordPlan.localExpandTarget,
        wordCount: flowWordCount(currentContent),
        suggestionPreview: suggestionsForRound.slice(0, 3),
      });
      const bestComplexWordHits = countSemrushComplexWordHits(bestSemrushContent);
      const bestHardSentenceHits = detectHardToReadSentences(bestSemrushContent).length;
      const contentBeforeRoundRewrite = currentContent;

      if (runSurgicalThisRound) {
        currentContent = applySemrushNearMissDeterministicFixes(currentContent);
        const surgicalInstruction =
          buildSemrushNearMissSurgicalInstruction(semrushResult, currentContent) ??
          (wordPlan.swaGap != null && wordPlan.swaGap >= SEMRUSH_WORD_GAP_INJECT_MIN
            ? buildSemrushWordGapSurgicalInstruction(
                semrushResult,
                wordPlan,
                ctx.targetKeyword,
              )
            : null);

        if (surgicalInstruction) {
          logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_surgical_start', {
            round: semrushOptimizeRounds,
            semrushScore: semrushResult.overall,
            wordCount: flowWordCount(currentContent),
          });
          await this.progressService.touchWorkflowProgress(ctx, {
            phase: 'semrush',
            round: semrushOptimizeRounds,
            maxRounds: semrushRoundCap,
            localScore: frozenLocalScore,
            semrushScore: semrushResult.overall,
            message: roundMessage,
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
              localScore: frozenLocalScore,
            },
          );
        } else {
          logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_surgical_skip', {
            round: semrushOptimizeRounds,
            semrushScore: semrushResult.overall,
          });
          this.logger.info('Semrush surgical tier: no LLM target, skipping full rewrite', {
            traceId: ctx.traceId,
            jobId: ctx.jobId,
            action: 'seo_checker.semrush_surgical_skip_llm',
            round: semrushOptimizeRounds,
            score: semrushResult.overall,
          });
        }
      } else {
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_llm_start', {
          round: semrushOptimizeRounds,
          roundAction: forceKeywordFirst ? 'semrush_keyword_first' : 'semrush_optimize',
          semrushScore: semrushResult.overall,
          recommendedKeywordCount: keywordsForRound.length,
          recommendedKeywords: summarizeFlowKeywords(keywordsForRound),
          suggestionCount: suggestionsForRound.length,
          readabilityPriority: semrushOptCtxForRound.readabilityPriority,
          wordCountExpandPriority: semrushOptCtxForRound.wordCountExpandPriority,
          wordCountTrimPriority: semrushOptCtxForRound.wordCountTrimPriority,
          wordCountBefore: flowWordCount(currentContent),
        });
        const contentBeforeLlm = currentContent;
        currentContent = await this.llmService.generateOptimize(
          ctx,
          currentContent,
          suggestionsForRound,
          keywordsForRound,
          buildSemrushOptimizeMeta({
            round: semrushOptimizeRounds,
            content: currentContent,
            semrushResult,
            localResult: frozenLocalResult,
            semrushOptCtx: semrushOptCtxForRound,
            protectedSeoPhrases,
            scoreConfig,
            roundAction: forceKeywordFirst ? 'semrush_keyword_first' : 'semrush_optimize',
            keywordBatch,
          }),
        );
        if (semrushOptCtxForRound.wordCountExpandPriority) {
          const guard = evaluateSemrushRoundOutput({
            beforeContent: contentBeforeLlm,
            afterContent: currentContent,
            keywordBatch,
            wordCountExpandPriority: semrushOptCtxForRound.wordCountExpandPriority,
            localExpandTarget: wordPlan.localExpandTarget,
          });
          if (guard.reasons.includes('shrank_body')) {
            this.logger.warn('Semrush expand round shrank body, reverting LLM output', {
              traceId: ctx.traceId,
              jobId: ctx.jobId,
              action: 'seo_checker.semrush_expand_shrink_revert',
              round: semrushOptimizeRounds,
              wordsBefore: guard.wordsBefore,
              wordsAfter: guard.wordsAfter,
              minWordCount: guard.minWordCount,
              missingKeywords: guard.missingKeywords,
            });
            currentContent = contentBeforeLlm;
          }
        }
      }
      const semrushBoostTarget = resolveSemrushBoostWordTarget(
        semrushResult.semrushCompetitorWordCount,
        input.targetWordCount,
        currentContent,
        semrushResult.semrushCurrentWordCount,
      );
      currentContent = boostLocalSeoContent(
        currentContent,
        buildSemrushBoostOptions(semrushBoostTarget, useSurgicalMode),
      );
      let structureFix = validateAndFixSemrushStructure(currentContent);
      currentContent = structureFix.content;
      const roundRepair = repairSemrushRoundOutput({
        content: currentContent,
        targetKeyword: ctx.targetKeyword,
        keywordBatch,
        wordCountExpandPriority: semrushOptCtxForRound.wordCountExpandPriority,
        localExpandTarget: wordPlan.localExpandTarget,
      });
      if (roundRepair.changed) {
        currentContent = roundRepair.content;
        const repairedStructureFix = validateAndFixSemrushStructure(currentContent);
        currentContent = repairedStructureFix.content;
        structureFix = {
          ...repairedStructureFix,
          fixed: structureFix.fixed || repairedStructureFix.fixed,
        };
        this.logger.info('Semrush round deterministic repair applied', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.semrush_round_repair',
          round: semrushOptimizeRounds,
          addedKeywords: roundRepair.addedKeywords,
          injectedWordBlocks: roundRepair.injectedWordBlocks,
          wordsBefore: roundRepair.wordsBefore,
          wordsAfter: roundRepair.wordsAfter,
        });
      }
      const finalRoundGuard = evaluateSemrushRoundOutput({
        beforeContent: contentBeforeRoundRewrite,
        afterContent: currentContent,
        keywordBatch,
        wordCountExpandPriority: semrushOptCtxForRound.wordCountExpandPriority,
        localExpandTarget: wordPlan.localExpandTarget,
      });
      if (!finalRoundGuard.accepted) {
        this.logger.warn('Semrush round output still below guard after repair', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.semrush_round_guard_failed',
          round: semrushOptimizeRounds,
          reasons: finalRoundGuard.reasons,
          wordsBefore: finalRoundGuard.wordsBefore,
          wordsAfter: finalRoundGuard.wordsAfter,
          minWordCount: finalRoundGuard.minWordCount,
          missingKeywords: finalRoundGuard.missingKeywords,
        });
      }
      const roundAudit = buildSemrushReadabilityAudit(currentContent);
      const bestAudit = buildSemrushReadabilityAudit(bestSemrushContent);
      const bestSubmittedKeywords =
        bestSemrushResult.semrushTargetKeywords ??
        buildSemrushSubmittedKeywords(bestSemrushContent, {
          targetKeyword: ctx.targetKeyword,
          poolKeywords: keywordsForRound,
        });
      const bestMissingKeywords = countSemrushMissingKeywords(
        bestSemrushContent,
        ctx.targetKeyword,
        bestSemrushResult,
        keywordsForRound,
        bestSubmittedKeywords,
      );
      const bestMissingTargetKeywords = countSemrushMissingSubmittedKeywords(
        bestSemrushContent,
        ctx.targetKeyword,
        bestSubmittedKeywords,
      );
      const candidateLocal = evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        input.serpData,
        input.targetWordCount,
        {
          competitorWordCount: semrushResult.semrushCompetitorWordCount,
        },
      );
      const semrushKeywords = mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
        candidateLocal.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
        { semrushResult: bestSemrushResult, content: currentContent },
      );
      const semrushRpaPool = mergeSemrushKeywordLists(
        keywordBatch,
        semrushKeywords,
        semrushPlanningFeedback.semrushTargetKeywords,
        semrushPlanningFeedback.semrushRecommendedKeywords,
        semrushPlanningFeedback.semrushMissingRecommendedKeywords,
        semrushPlanningFeedback.semrushMissingTargetKeywords,
        bestSemrushResult.semrushTargetKeywords,
        bestSemrushResult.semrushRecommendedKeywords,
        bestSemrushResult.semrushMissingRecommendedKeywords,
        bestSemrushResult.semrushMissingTargetKeywords,
      );
      await this.progressService.touchWorkflowProgress(ctx, {
        phase: 'semrush-check',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: frozenLocalScore,
        semrushScore: semrushResult.overall,
        message: `第 ${semrushOptimizeRounds} 轮正文已更新，重新 Semrush 终检中…`,
      });
      await this.rpaService.assertSemrushWorkNotCancelled(ctx);
      const semrushRpaInput = {
        content: currentContent,
        keyword: stableSemrushSubmittedKeywords[0] ?? ctx.targetKeyword,
        recommendedKeywords: stableSemrushSubmittedKeywords.slice(1),
        submittedKeywords: stableSemrushSubmittedKeywords,
      };

      const candidatePrediction = buildCalibrationPredictionForContent(
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
          missingKeywordCountOverride: countSemrushMissingKeywords(
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
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_rpa_skip_proxy', {
          round: semrushOptimizeRounds,
          reason: 'skip_accept_proxy',
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
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_rpa_skip_proxy', {
          round: semrushOptimizeRounds,
          reason: 'skip_reject',
          predicted: recheckDecision.predicted,
          bestOverall: bestSemrushScore,
        });
      } else {
        candidateSemrush = await this.rpaService.runSemrushCheck(
          { ...semrushRpaInput, preferredNodeKey: input.preferredNodeKey },
          ctx,
          {
            rpaKind: 'recheck',
            round: semrushOptimizeRounds,
            poolKeywords: semrushRpaPool,
            swaRecommended: bestSemrushResult.semrushRecommendedKeywords,
            swaMissing: bestSemrushResult.semrushMissingRecommendedKeywords,
            recheckDecision: recheckDecision.action,
          },
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
      if (!candidateSemrush.skipped && candidateSemrush.calibrationProxy !== true) {
        semrushPlanningFeedback = mergeSemrushPlanningFeedbackState(
          semrushPlanningFeedback,
          candidateSemrush,
        );
      }
      const rpaSnapshotContent = currentContent;
      const candidateMissingKeywords = countSemrushMissingKeywords(
        currentContent,
        ctx.targetKeyword,
        candidateSemrush,
        semrushKeywords,
        semrushRpaInput.submittedKeywords,
      );
      const candidateMissingTargetKeywords = countSemrushMissingSubmittedKeywords(
        currentContent,
        ctx.targetKeyword,
        semrushRpaInput.submittedKeywords,
      );
      const readabilityImproved =
        roundAudit.longParagraphCount < bestAudit.longParagraphCount ||
        roundAudit.longSentenceCount < bestAudit.longSentenceCount;
      const acceptDecision = decideSemrushCandidateAcceptance(
        {
          candidateOverall: candidateSemrush.overall,
          bestOverall: bestSemrushScore,
          candidateMissingKeywordCount: candidateMissingKeywords,
          bestMissingKeywordCount: bestMissingKeywords,
          candidateMissingTargetKeywordCount: candidateMissingTargetKeywords,
          bestMissingTargetKeywordCount: bestMissingTargetKeywords,
          readabilityImproved,
          candidateComplexWordHits: countSemrushComplexWordHits(currentContent),
          bestComplexWordHits,
          candidateHardSentenceHits: detectHardToReadSentences(currentContent).length,
          bestHardSentenceHits,
        },
        scoreConfig,
      );
      const accepted = acceptDecision.accepted;
      logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_round_decision', {
        round: semrushOptimizeRounds,
        rpaRan: rpaRanThisRound,
        candidateSemrushScore: candidateSemrush.overall,
        bestSemrushScore,
        candidateReadabilityScore: candidateSemrush.semrushReadabilityScore,
        missingKeywords: candidateMissingKeywords,
        bestMissingKeywords,
        missingTargetKeywords: candidateMissingTargetKeywords,
        bestMissingTargetKeywords,
        accepted,
        acceptReason: acceptDecision.reason,
        readabilityImproved,
      });
      this.logger.info('Semrush optimize round metrics', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.semrush_round_metrics',
        round: semrushOptimizeRounds,
        semrushScore: candidateSemrush.overall,
        bestSemrushScore,
        semrushReadabilityScore: candidateSemrush.semrushReadabilityScore,
        wordGap:
          typeof candidateSemrush.semrushCompetitorWordCount === 'number' &&
          typeof candidateSemrush.semrushCurrentWordCount === 'number'
            ? candidateSemrush.semrushCompetitorWordCount -
              candidateSemrush.semrushCurrentWordCount
            : undefined,
        missingKeywords: candidateMissingKeywords,
        bestMissingKeywords,
        missingTargetKeywords: candidateMissingTargetKeywords,
        bestMissingTargetKeywords,
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
        bestSemrushResult = mergeSemrushPlanningFeedback(
          candidateSemrush,
          semrushPlanningFeedback,
        );
        bestLocalAtSemrush = candidateLocal;
        semrushResult = bestSemrushResult;
        localResult = candidateLocal;
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_round_accept', {
          round: semrushOptimizeRounds,
          semrushScore: candidateSemrush.overall,
          missingKeywords: candidateMissingKeywords,
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'semrush', round: semrushOptimizeRounds },
          {
            scoreAfter: semrushResult.overall,
            localScoreAfter: frozenLocalScore,
          },
        );
      } else {
        const semrushRollbackReason =
          acceptDecision.reason === 'target_keyword_regressed'
            ? 'target_keyword_regressed'
            : 'score_regressed';
        consecutiveSemrushRollbacks += 1;
        bestSemrushResult = mergeSemrushPlanningFeedback(
          bestSemrushResult,
          semrushPlanningFeedback,
        );
        await this.llmService.revertDraftContent(ctx, bestSemrushContent);
        currentContent = bestSemrushContent;
        semrushResult = bestSemrushResult;
        localResult = bestLocalAtSemrush;
        logSeoPipelineFlow(this.logger, flowCtx(ctx), 'pipeline.semrush_round_rollback', {
          round: semrushOptimizeRounds,
          candidateSemrushScore: candidateSemrush.overall,
          bestSemrushScore,
          candidateLocalScore: candidateLocal.score,
          bestLocalScore: bestLocalAtSemrush.score,
          rollbackReason: acceptDecision.reason,
        });
        this.logger.warn('Semrush optimize rolled back to best version', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.semrush_optimize_rollback',
          round: semrushOptimizeRounds,
          candidateSemrush: candidateSemrush.overall,
          candidateLocal: candidateLocal.score,
          bestSemrush: bestSemrushScore,
          bestLocal: bestLocalAtSemrush.score,
          rollbackReason: acceptDecision.reason,
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'semrush', round: semrushOptimizeRounds },
          {
            scoreAfter: bestSemrushScore,
            localScoreAfter: frozenLocalScore,
            rolledBack: true,
            candidateScoreAfter: candidateSemrush.overall,
            candidateLocalScoreAfter: candidateLocal.score,
            rollbackReason: semrushRollbackReason,
          },
        );
      }
      const persistedRoundGate = buildLocalGateEvaluation(
        input.calibrationRuntime ?? {
          shadowEnabled: false,
          reduceRpaEnabled: false,
          localAlignEnabled: false,
          localAlignEffective: false,
          model: null,
          featureMeans: null,
        },
        input.localGate,
        {
          localResult: bestLocalAtSemrush,
          targetKeyword: ctx.targetKeyword,
          content: bestSemrushContent,
          jobBriefData: input.jobBriefData,
          serpData: input.serpData,
          targetWordCount: input.targetWordCount,
          poolKeywords: input.recommendedKeywords,
          semrushResult: bestSemrushResult,
        },
      );
      const persistedRoundLocalFields = buildLocalGatePersistedFields({
        gate: input.localGate,
        localScore: frozenLocalScore,
        prediction: persistedRoundGate.prediction,
      });
      await this.progressService.persistSemrushProgress(ctx, {
        localResult: bestLocalAtSemrush,
        frozenLocalResult,
        semrushResult: bestSemrushResult,
        localOptimizeRounds,
        semrushOptimizeRounds,
        content: bestSemrushContent,
        existingSeoCheck: input.seoCheck,
        recommendedKeywords: input.recommendedKeywords,
        targetKeyword: ctx.targetKeyword,
        localGatePassed: persistedRoundLocalFields.passed,
        localGateMode: persistedRoundLocalFields.gateMode,
        predictedSemrush: persistedRoundLocalFields.predictedSemrush,
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
      const confirmKeywords = mergeRecommendedKeywordsForWriting(
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
      const confirmed = await this.rpaService.runSemrushCheck(
        { ...confirmInput, preferredNodeKey: input.preferredNodeKey },
        ctx,
        { rpaKind: 'confirm' },
      );
      if (!confirmed.skipped) {
        bestSemrushResult = confirmed;
        bestSemrushScore = confirmed.overall;
        semrushResult = confirmed;
        await this.progressService.appendSemrushRpaSnapshot(ctx, {
          content: bestSemrushContent,
          targetKeyword: ctx.targetKeyword,
          recommendedKeywords: confirmKeywords,
          semrushResult: confirmed,
          localResult: bestLocalAtSemrush,
          round: semrushOptimizeRounds,
        });
        if (input.calibrationRuntime.shadowEnabled) {
          const confirmPrediction = buildCalibrationPredictionForContent(
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
}
