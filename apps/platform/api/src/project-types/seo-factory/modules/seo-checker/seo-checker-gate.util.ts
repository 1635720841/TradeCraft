/**
 * SEO 查分：本地进门闸与校准预测工具。
 */
import {
  applyFleschTowardSemrushTarget,
  applyKeywordDensityNudge,
  applySemrushDefaultComplexWordFixes,
  boostLocalSeoContent,
  fixSemrushArticleTitleInContent,
  isFleschProgressTowardTarget,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  type LocalSeoScoreResult,
  type ScoreCalibrationPrediction,
  type ContentScoreSnapshot,
} from '@wm/shared-core';
import type { SeoScore } from '@wm/provider-interfaces';
import { LOCAL_SEO_NEAR_MISS_MARGIN } from '../../constants/seo-score';
import {
  resolveSiteSeoScoreConfig,
  DEFAULT_SITE_SEO_SCORE_CONFIG,
  hasExplicitLocalPassThreshold,
  type ResolvedSiteSeoScoreConfig,
} from '../../constants/site-seo-score-settings';
import {
  isLocalGatePassed,
  localGatePointsToGo,
  resolveLocalGateContext,
  type LocalGateContext,
} from '../../utils/score-calibration-local-align.util';
import type { ScoreCalibrationRuntime } from '../../utils/score-calibration-runtime.util';
import { buildCalibrationPrediction } from '../../utils/score-calibration-runtime.util';
import {
  extractBriefRecommendedKeywords,
  resolveSubmittedKeywords,
  scoreArticleContentFromLocal,
} from '../../utils/article-content-score.util';
import { buildContentScoreSnapshot } from '../../utils/article-content-score-snapshot.util';
import {
  buildSemrushSubmittedKeywords,
} from '../../providers/semrush/semrush-submitted-keywords.util';
import type { LlmJobContext } from '../llm/llm.service';
import type { SerpOrganicRow } from './seo-checker.types';
import { evaluateLocal } from './seo-checker-scoring.util';

export function resolveJobLocalGate(
    settings: unknown,
    calibrationRuntime: ScoreCalibrationRuntime,
    scoreConfig?: ResolvedSiteSeoScoreConfig,
  ): LocalGateContext {
    const config = scoreConfig ?? resolveSiteSeoScoreConfig(settings);
    return resolveLocalGateContext({
      localAlignEnabled: calibrationRuntime.localAlignEnabled,
      localAlignEffective: calibrationRuntime.localAlignEffective,
      scoreConfig: config,
      explicitLocalPassThreshold: hasExplicitLocalPassThreshold(settings),
    });
  }

export function buildLocalGateEvaluation(
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
        ? buildCalibrationPredictionForContent(calibrationRuntime, {
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

export function buildPipelineContentScoreSnapshot(input: {
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

export function buildCalibrationPredictionForContent(
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

export function applyCalibratedFinalGateBoost(
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
    const baselineGate = buildLocalGateEvaluation(calibrationRuntime, localGate, {
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

    const result = evaluateLocal(
      input.keyword,
      working,
      input.serpData,
      input.targetWordCount,
    );
    const boostedGate = buildLocalGateEvaluation(calibrationRuntime, localGate, {
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

export function applyDeterministicLocalBoost(
    keyword: string,
    content: string,
    serpData: { organic?: SerpOrganicRow[] } | null,
    targetWordCount: number,
    baselineScore: number,
    scoreConfig: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
  ): { content: string; result: LocalSeoScoreResult; applied: boolean } {
    let working = content;
    const titleFixed = fixSemrushArticleTitleInContent(working, keyword);
    if (titleFixed !== working) {
      const titleResult = evaluateLocal(keyword, titleFixed, serpData, targetWordCount);
      if (titleResult.score >= baselineScore) {
        working = titleFixed;
        baselineScore = titleResult.score;
      }
    }
    if (baselineScore >= scoreConfig.localPassThreshold - LOCAL_SEO_NEAR_MISS_MARGIN) {
      const densityNudged = applyKeywordDensityNudge(keyword, working);
      if (densityNudged !== working) {
        const densityResult = evaluateLocal(keyword, densityNudged, serpData, targetWordCount);
        if (densityResult.score >= baselineScore) {
          working = densityNudged;
          baselineScore = densityResult.score;
        }
      }
      const complexFixed = applySemrushDefaultComplexWordFixes(working);
      if (complexFixed !== working) {
        const complexResult = evaluateLocal(keyword, complexFixed, serpData, targetWordCount);
        if (complexResult.score >= baselineScore) {
          working = complexFixed;
        }
      }
    }
    const boosted = boostLocalSeoContent(working, { targetWordCount });
    if (boosted === working && working === content) {
      return {
        content,
        result: evaluateLocal(keyword, content, serpData, targetWordCount),
        applied: false,
      };
    }
    const result = evaluateLocal(keyword, boosted, serpData, targetWordCount);
    if (result.score >= baselineScore) {
      return { content: boosted, result, applied: true };
    }
    if (working !== content) {
      const fallbackResult = evaluateLocal(keyword, working, serpData, targetWordCount);
      if (fallbackResult.score >= baselineScore) {
        return { content: working, result: fallbackResult, applied: true };
      }
    }
    return {
      content,
      result: evaluateLocal(keyword, content, serpData, targetWordCount),
      applied: false,
    };
  }
