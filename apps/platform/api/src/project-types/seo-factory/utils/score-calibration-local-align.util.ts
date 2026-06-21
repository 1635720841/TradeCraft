/**
 * 本地预检对齐 Semrush：用校准预测分（0–10）与 semrushPassThreshold 作为进门闸。
 *
 * 边界：
 * - 不负责：模型训练（score-calibration-model）
 * - 不负责：Semrush RPA 终检（仍走 Playwright 真分）
 */

import {
  resolveModelEvalMae,
  SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN,
  isFleschAlignedWithSemrush,
  isFleschProgressTowardTarget,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  computeSemrushTitleOverallPenalty,
  resolveSemrushArticleTitle,
  type LocalSeoScoreResult,
  type ScoreCalibrationModel,
  type ScoreCalibrationPrediction,
} from '@wm/shared-core';
import {
  LOCAL_SEO_NEAR_MISS_MARGIN,
  SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN,
  SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN,
  SCORE_CALIBRATION_PREDICTED_ACCEPT_TOLERANCE,
  SCORE_CALIBRATION_REDUCE_RPA_MAX_MODEL_MAE,
  SEMRUSH_NEAR_MISS_MARGIN,
  SEMRUSH_ULTRA_NEAR_MISS_MARGIN,
} from '../constants/seo-score';
import {
  DEFAULT_SITE_SEO_SCORE_CONFIG,
  type ResolvedSiteSeoScoreConfig,
} from '../constants/site-seo-score-settings';
import {
  resolveLocalOptimizeRoundCap,
  resolveSemrushOptimizeRoundCap,
  shouldAcceptLocalCandidate,
} from './seo-pipeline.util';

export type LocalGateMode = 'legacy' | 'calibrated';

export interface LocalGateContext {
  mode: LocalGateMode;
  /** 校准对齐是否真正生效（开关 + 模型生产就绪） */
  effective: boolean;
  /** 当前模式下的过关线 */
  threshold: number;
}

const SCORE_CALIBRATION_LOCAL_ALIGN_MIN_TRAIN = 30;

/** 校准模式下 SERP 未达此分（/25）时优先补实体词（实验室 near-miss 主缺口） */
export const SEMRUSH_ALIGNED_SERP_PRIORITY_BELOW = 20;

/** 站点开启且模型达到生产门槛时，本地进门闸改用校准预测 Semrush */
export function resolveLocalAlignEffective(input: {
  localAlignEnabled: boolean;
  model: ScoreCalibrationModel | null;
}): boolean {
  if (!input.localAlignEnabled || !input.model) return false;
  const evalMae = resolveModelEvalMae(input.model);
  if (evalMae === null || evalMae > SCORE_CALIBRATION_REDUCE_RPA_MAX_MODEL_MAE) {
    return false;
  }
  const holdout = input.model.holdoutSampleCount ?? 0;
  if (holdout < SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN) return false;
  const train = input.model.trainSampleCount ?? input.model.sampleCount ?? 0;
  if (train < SCORE_CALIBRATION_LOCAL_ALIGN_MIN_TRAIN) return false;
  return true;
}

export function resolveLocalGateContext(input: {
  localAlignEnabled: boolean;
  localAlignEffective: boolean;
  scoreConfig?: ResolvedSiteSeoScoreConfig;
}): LocalGateContext {
  const scoreConfig = input.scoreConfig ?? DEFAULT_SITE_SEO_SCORE_CONFIG;
  if (input.localAlignEffective) {
    return {
      mode: 'calibrated',
      effective: true,
      threshold: scoreConfig.semrushPassThreshold,
    };
  }
  return {
    mode: 'legacy',
    effective: false,
    threshold: scoreConfig.localPassThreshold,
  };
}

export function isLocalGatePassed(input: {
  gate: LocalGateContext;
  localScore: number;
  prediction: ScoreCalibrationPrediction | null;
}): boolean {
  if (input.gate.mode === 'calibrated' && input.prediction) {
    return input.prediction.predictedSemrush >= input.gate.threshold;
  }
  return input.localScore >= input.gate.threshold;
}

export function localGatePointsToGo(input: {
  gate: LocalGateContext;
  localScore: number;
  prediction: ScoreCalibrationPrediction | null;
}): number {
  if (input.gate.mode === 'calibrated' && input.prediction) {
    return Math.max(
      0,
      Math.round((input.gate.threshold - input.prediction.predictedSemrush) * 10) / 10,
    );
  }
  return Math.max(0, input.gate.threshold - input.localScore);
}

export function isLocalGateNearMiss(input: {
  gate: LocalGateContext;
  bestGateScore: number;
}): boolean {
  if (input.gate.mode === 'calibrated') {
    return (
      input.bestGateScore >= input.gate.threshold - SEMRUSH_NEAR_MISS_MARGIN ||
      input.bestGateScore >= input.gate.threshold - SEMRUSH_ULTRA_NEAR_MISS_MARGIN
    );
  }
  return input.bestGateScore >= input.gate.threshold - LOCAL_SEO_NEAR_MISS_MARGIN;
}

export function resolveLocalGateRoundCap(input: {
  gate: LocalGateContext;
  bestGateScore: number;
  completedRounds: number;
  isLocalResume: boolean;
  scoreConfig?: ResolvedSiteSeoScoreConfig;
  strictCap?: boolean;
}): number {
  const scoreConfig = input.scoreConfig ?? DEFAULT_SITE_SEO_SCORE_CONFIG;
  if (input.gate.mode === 'calibrated') {
    return resolveSemrushOptimizeRoundCap(
      input.bestGateScore,
      input.completedRounds,
      input.isLocalResume,
      scoreConfig,
      { strictCap: input.strictCap },
    );
  }
  return resolveLocalOptimizeRoundCap(
    input.bestGateScore,
    input.completedRounds,
    input.isLocalResume,
    scoreConfig,
    { strictCap: input.strictCap },
  );
}

export function shouldAcceptLocalGateCandidate(input: {
  gate: LocalGateContext;
  candidateLocalScore: number;
  bestLocalScore: number;
  candidatePredicted: number;
  bestPredicted: number;
  candidateKeywordCoverage: number;
  bestKeywordCoverage: number;
  nearMiss: boolean;
  readabilityImproved: boolean;
  candidateFlesch?: number;
  bestFlesch?: number;
  fleschTarget?: number;
  candidateSerpAlignment?: number;
  bestSerpAlignment?: number;
}): boolean {
  if (input.gate.mode === 'calibrated') {
    if (input.candidateKeywordCoverage < input.bestKeywordCoverage) return false;
    if (input.candidatePredicted > input.bestPredicted) return true;

    const fleschTarget = input.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT;
    const fleschProgress =
      typeof input.candidateFlesch === 'number' &&
      typeof input.bestFlesch === 'number' &&
      isFleschProgressTowardTarget({
        before: input.bestFlesch,
        after: input.candidateFlesch,
        target: fleschTarget,
      });
    const serpProgress =
      (input.candidateSerpAlignment ?? 0) > (input.bestSerpAlignment ?? 0);

    if (
      input.candidatePredicted >=
        input.bestPredicted - SCORE_CALIBRATION_PREDICTED_ACCEPT_TOLERANCE &&
      (fleschProgress || serpProgress || input.readabilityImproved)
    ) {
      return true;
    }

    const fleschImproved =
      typeof input.candidateFlesch === 'number' &&
      typeof input.bestFlesch === 'number' &&
      isFleschProgressTowardTarget({
        before: input.bestFlesch,
        after: input.candidateFlesch,
        target: fleschTarget,
      });
    if (fleschImproved && input.candidatePredicted >= input.bestPredicted - 0.12) {
      return true;
    }

    return (
      input.nearMiss &&
      input.readabilityImproved &&
      input.candidatePredicted >= input.bestPredicted - 0.2
    );
  }
  return shouldAcceptLocalCandidate({
    candidateScore: input.candidateLocalScore,
    bestScore: input.bestLocalScore,
    candidateKeywordCoverage: input.candidateKeywordCoverage,
    bestKeywordCoverage: input.bestKeywordCoverage,
    nearMiss: input.nearMiss,
    readabilityImproved: input.readabilityImproved,
  });
}

/** 本地轮次用尽后：预测分接近通过线时仍放行 Semrush RPA */
export function isLocalGateSoftPass(input: {
  gate: LocalGateContext;
  prediction: ScoreCalibrationPrediction | null;
  margin?: number;
  localScore?: number;
  localPassThreshold?: number;
}): boolean {
  if (input.gate.mode !== 'calibrated' || !input.prediction) return false;
  const margin = input.margin ?? SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN;
  if (input.prediction.predictedSemrush >= input.gate.threshold - margin) {
    return true;
  }
  const localThreshold =
    input.localPassThreshold ?? DEFAULT_SITE_SEO_SCORE_CONFIG.localPassThreshold;
  if (
    typeof input.localScore === 'number' &&
    input.localScore >= localThreshold &&
    input.prediction.predictedSemrush >=
      input.gate.threshold - SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN
  ) {
    return true;
  }
  return false;
}

export function shouldSkipLocalOptimizationAligned(
  localSeoScore: number | null | undefined,
  seoCheck: {
    local?: {
      passed?: boolean;
      predictedSemrush?: number;
      gateMode?: LocalGateMode;
    };
  },
  gate: LocalGateContext,
): boolean {
  if (seoCheck.local?.passed === true) return true;
  if (
    gate.mode === 'calibrated' &&
    typeof seoCheck.local?.predictedSemrush === 'number'
  ) {
    return seoCheck.local.predictedSemrush >= gate.threshold;
  }
  return (localSeoScore ?? 0) >= gate.threshold;
}

/** 校准对齐模式：SERP 未满时优先补实体，SERP 已满再攻可读性 */
export function resolveCalibratedOptimizeFocus(input: {
  gate: LocalGateContext;
  localResult: Pick<LocalSeoScoreResult, 'breakdown' | 'metrics' | 'recommendedKeywords'>;
  pointsToGo: number;
  content?: string;
  targetKeyword?: string;
  articleTitle?: string;
}): {
  serpPriority: boolean;
  readabilityPriority: boolean;
  fleschPriority: boolean;
  hardSentencePriority: boolean;
  titlePriority: boolean;
} {
  if (input.gate.mode !== 'calibrated' || input.pointsToGo <= 0) {
    return {
      serpPriority: false,
      readabilityPriority: false,
      fleschPriority: false,
      hardSentencePriority: false,
      titlePriority: false,
    };
  }

  const serpScore = input.localResult.breakdown.serpTermAlignment;
  const serpMaxed = serpScore >= 25;
  const serpCritical = serpScore < SEMRUSH_ALIGNED_SERP_PRIORITY_BELOW;
  const missingSerpEntities = (input.localResult.recommendedKeywords?.length ?? 0) > 0;
  /** SERP 20–24 且仍有缺词时继续补实体（实验室 near-miss 主因） */
  const serpResidual = !serpMaxed && !serpCritical && missingSerpEntities;
  const serpPriority = serpCritical || serpResidual;
  const serpAdequate = serpScore >= SEMRUSH_ALIGNED_SERP_PRIORITY_BELOW;
  const m = input.localResult.metrics;
  const flesch = m.fleschReadingEase ?? SEMRUSH_FLESCH_TARGET_DEFAULT;
  const fleschMisaligned = !isFleschAlignedWithSemrush(flesch);
  const resolvedTitle = resolveSemrushArticleTitle({
    content: input.content ?? '',
    targetKeyword: input.targetKeyword ?? '',
    articleTitle: input.articleTitle,
  });
  const titlePenalty = computeSemrushTitleOverallPenalty(resolvedTitle);
  const titleCritical =
    Boolean(input.content?.trim()) && titlePenalty >= 0.35;
  const hardSentenceCritical = (m.hardToReadSentenceHits ?? 0) > 2;
  /** 标题问题：SWA Overall 常见缺口，正文规则分 100 仍可能只有 7.x */
  const titlePriority = !serpPriority && serpAdequate && titleCritical;
  /** 难读句 >2：预测分常见瓶颈，须外科式改指定原句（不限于 >22 词长句） */
  const hardSentencePriority =
    !serpPriority && !titlePriority && serpAdequate && hardSentenceCritical;
  /** Flesch 在 ±8 内但仍偏低（如 43）时，校准模型 fleschNorm 仍会拖预测分 */
  const fleschSoftGap =
    input.pointsToGo > 0 && flesch < SEMRUSH_FLESCH_TARGET_DEFAULT - 2;
  /** SERP 已够（≥20/25）但 Flesch 未进 Sem 区间时优先攻可读性指数 */
  const fleschPriority =
    !serpPriority &&
    !titlePriority &&
    serpAdequate &&
    !hardSentenceCritical &&
    (fleschMisaligned || fleschSoftGap);
  const readabilityGap = 20 - input.localResult.breakdown.readability;
  const readabilitySignals =
    readabilityGap >= 2 ||
    m.longSentencesOver22 > 2 ||
    m.longParagraphsOver65 > 1 ||
    m.passiveVoiceHits > 6 ||
    (m.semrushComplexWordHits ?? 0) > 0 ||
    (m.hardToReadSentenceHits ?? 0) > 0;

  const readabilityPriority =
    !serpPriority &&
    !titlePriority &&
    !fleschPriority &&
    !hardSentencePriority &&
    serpAdequate &&
    (readabilitySignals || input.pointsToGo > 0);

  return {
    serpPriority,
    readabilityPriority,
    fleschPriority,
    hardSentencePriority,
    titlePriority,
  };
}
