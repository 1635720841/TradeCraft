/**
 * M6 评分校准运行时：影子日志、降频 RPA 决策、代理分构造。
 *
 * 边界：
 * - 不负责：模型训练（score-calibration-model）
 * - 不负责：Semrush RPA 执行（SeoCheckerService）
 */

import type { SeoScore } from '@wm/provider-interfaces';
import {
  LOCAL_SEO_PASS_THRESHOLD,
  resolveModelEvalMae,
  type ScoreCalibrationConfidence,
  type ScoreCalibrationFeatures,
  type ScoreCalibrationModel,
  type ScoreCalibrationPrediction,
  type LocalSeoScoreResult,
} from '@wm/shared-core';
import {
  SCORE_CALIBRATION_REDUCE_RPA_MAX_MODEL_MAE,
  SCORE_CALIBRATION_SHADOW_MAX,
  SCORE_CALIBRATION_SKIP_REJECT_DELTA,
  SEMRUSH_PASS_THRESHOLD,
} from '../constants/seo-score';
import {
  scoreArticleContentFromLocal,
  toScoreCalibrationPrediction,
} from './article-content-score.util';

export interface ScoreCalibrationRuntime {
  shadowEnabled: boolean;
  reduceRpaEnabled: boolean;
  /** 站点开关：本地进门闸对齐 Semrush */
  localAlignEnabled: boolean;
  /** 开关 + 模型生产就绪 */
  localAlignEffective: boolean;
  model: ScoreCalibrationModel | null;
  featureMeans: ScoreCalibrationFeatures | null;
}

export type CalibrationShadowPhase = 'pre_rpa' | 'post_rpa' | 'rpa_skipped';

export type SemrushRecheckDecision =
  | { action: 'run_rpa' }
  | { action: 'skip_accept_proxy'; predicted: number; reason: string }
  | { action: 'skip_reject'; predicted: number; reason: string };

export interface CalibrationShadowEntry {
  id: string;
  at: string;
  phase: CalibrationShadowPhase;
  round?: number;
  localScore: number;
  predictedSemrush: number;
  confidence: ScoreCalibrationConfidence;
  actualSemrush?: number;
  absError?: number;
  decision?: SemrushRecheckDecision['action'];
  reason?: string;
  rpaSkipped?: boolean;
}

export interface BuildCalibrationPredictionInput {
  localResult: LocalSeoScoreResult;
  model: ScoreCalibrationModel | null;
  featureMeans?: ScoreCalibrationFeatures | null;
  targetKeyword: string;
  content: string;
  submittedKeywords?: string[];
  targetWordCount?: number;
  competitorWordCount?: number;
  priorSemrushNode?: string;
  /** M6 已用 Semrush 规则算好的缺词数 */
  missingKeywordCountOverride?: number;
  /** draft.title；未传则从正文 H1 推断 */
  articleTitle?: string;
}

/** M6 校准预测：与改稿页 content-score 同源（scoreArticleContentFromLocal） */
export function buildCalibrationPrediction(
  input: BuildCalibrationPredictionInput,
): ScoreCalibrationPrediction {
  const result = scoreArticleContentFromLocal({
    localResult: input.localResult,
    targetKeyword: input.targetKeyword,
    content: input.content,
    submittedKeywords: input.submittedKeywords,
    targetWordCount: input.targetWordCount,
    competitorWordCount: input.competitorWordCount,
    priorSemrushNode: input.priorSemrushNode,
    model: input.model,
    featureMeans: input.featureMeans,
    missingKeywordCountOverride: input.missingKeywordCountOverride,
    articleTitle: input.articleTitle,
  });
  return toScoreCalibrationPrediction(result, input.model);
}

/** 优化轮是否可跳过 Semrush RPA（首检不可跳过，由调用方保证） */
export function resolveSemrushRecheckDecision(input: {
  model: ScoreCalibrationModel | null;
  prediction: ScoreCalibrationPrediction;
  bestOverall: number;
  candidateLocalScore: number;
  semrushPassThreshold?: number;
  localAlignEffective?: boolean;
  candidatePredictedSemrush?: number;
}): SemrushRecheckDecision {
  const { model, prediction, bestOverall, candidateLocalScore } = input;
  const passThreshold = input.semrushPassThreshold ?? SEMRUSH_PASS_THRESHOLD;
  const localPassOk =
    input.localAlignEffective === true &&
    typeof input.candidatePredictedSemrush === 'number'
      ? input.candidatePredictedSemrush >= passThreshold
      : candidateLocalScore >= LOCAL_SEO_PASS_THRESHOLD;

  const evalMae = resolveModelEvalMae(model);
  if (evalMae === null || evalMae > SCORE_CALIBRATION_REDUCE_RPA_MAX_MODEL_MAE) {
    return { action: 'run_rpa' };
  }
  if (prediction.usedFallback || prediction.confidence === 'low') {
    return { action: 'run_rpa' };
  }

  const predicted = prediction.predictedSemrush;

  if (
    predicted >= passThreshold &&
    predicted >= bestOverall &&
    localPassOk &&
    prediction.confidence === 'high'
  ) {
    return {
      action: 'skip_accept_proxy',
      predicted,
      reason: 'calibration_high_confidence_pass',
    };
  }

  if (predicted < bestOverall - SCORE_CALIBRATION_SKIP_REJECT_DELTA) {
    return {
      action: 'skip_reject',
      predicted,
      reason: 'calibration_predicted_regression',
    };
  }

  return { action: 'run_rpa' };
}

/** 用上一轮 Semrush 侧栏数据 + 校准预测分构造代理结果 */
export function buildCalibrationProxyScore(
  base: SeoScore,
  predictedOverall: number,
): SeoScore {
  return {
    ...base,
    overall: Math.round(predictedOverall * 10) / 10,
    calibrationProxy: true,
    calibrationPredicted: predictedOverall,
    analysisSource: base.analysisSource ?? 'mixed',
  };
}

export function appendCalibrationShadow(
  seoCheckData: Record<string, unknown>,
  entry: CalibrationShadowEntry,
): Record<string, unknown> {
  const prev = Array.isArray(seoCheckData.calibrationShadow)
    ? (seoCheckData.calibrationShadow as CalibrationShadowEntry[])
    : [];
  return {
    ...seoCheckData,
    calibrationShadow: [...prev, entry].slice(-SCORE_CALIBRATION_SHADOW_MAX),
  };
}

export function createCalibrationShadowEntry(input: {
  phase: CalibrationShadowPhase;
  round?: number;
  localScore: number;
  prediction: ScoreCalibrationPrediction;
  actualSemrush?: number;
  decision?: SemrushRecheckDecision;
  rpaSkipped?: boolean;
}): CalibrationShadowEntry {
  const absError =
    typeof input.actualSemrush === 'number'
      ? Math.round(Math.abs(input.prediction.predictedSemrush - input.actualSemrush) * 100) / 100
      : undefined;

  return {
    id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    phase: input.phase,
    round: input.round,
    localScore: input.localScore,
    predictedSemrush: input.prediction.predictedSemrush,
    confidence: input.prediction.confidence,
    actualSemrush: input.actualSemrush,
    absError,
    decision: input.decision?.action,
    reason: input.decision && 'reason' in input.decision ? input.decision.reason : undefined,
    rpaSkipped: input.rpaSkipped,
  };
}

export function aggregateCalibrationShadowStats(
  entries: CalibrationShadowEntry[],
): {
  totalEntries: number;
  rpaSkippedCount: number;
  avgAbsError: number;
  postRpaCount: number;
} {
  if (entries.length === 0) {
    return { totalEntries: 0, rpaSkippedCount: 0, avgAbsError: 0, postRpaCount: 0 };
  }
  const withError = entries.filter((entry) => typeof entry.absError === 'number');
  const rpaSkippedCount = entries.filter((entry) => entry.rpaSkipped).length;
  const postRpaCount = entries.filter((entry) => entry.phase === 'post_rpa').length;
  const avgAbsError =
    withError.length === 0
      ? 0
      : Math.round(
          (withError.reduce((sum, entry) => sum + (entry.absError ?? 0), 0) / withError.length) *
            100,
        ) / 100;

  return {
    totalEntries: entries.length,
    rpaSkippedCount,
    avgAbsError,
    postRpaCount,
  };
}
