/**
 * Semrush 分数校准模型：用本地特征 + 线性回归拟合 Semrush Overall（0–10）。
 *
 * 边界：
 * - 不负责：DB 读取与 HTTP（由 score-calibration 模块处理）
 * - 不负责：替代 Semrush RPA 终检（仅预测与降频决策辅助）
 */

import type { LocalSeoScoreBreakdown, LocalSeoScoreResult } from './local-seo-score';
import { SEMRUSH_FLESCH_TARGET_DEFAULT } from './flesch-readability.util';
import { resolveCalibrationWordGap } from './semrush-readability-align.util';

export const SCORE_CALIBRATION_MODEL_VERSION = 3 as const;
export const SCORE_CALIBRATION_MIN_SAMPLES = 12;
export const SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT = 5;
export const SCORE_CALIBRATION_HOLDOUT_JOB_RATIO = 0.2;

export interface ScoreCalibrationSemrushContext {
  /** 上一轮 Semrush 竞品标杆词数（优化轮 pre-RPA 可用） */
  competitorWordCount?: number;
  /** brief / SWA 目标篇幅（无竞品标杆时用于词数缺口） */
  targetWordCount?: number;
  missingKeywordCount?: number;
  /** 上一轮 Semrush 3ue 节点（滞后信号） */
  semrushNode?: string;
}

export interface ScoreCalibrationFeatures {
  localScoreNorm: number;
  keywordCoverageNorm: number;
  serpNorm: number;
  structureNorm: number;
  readabilityNorm: number;
  depthNorm: number;
  wordCountNorm: number;
  longSentenceNorm: number;
  fleschNorm: number;
  wordGapNorm: number;
  missingKeywordsNorm: number;
  semrushNodeNorm: number;
}

export interface ScoreCalibrationTrainingRow {
  features: ScoreCalibrationFeatures;
  semrushOverall: number;
  /** 按任务分组 holdout，避免同文多轮泄漏 */
  jobId?: string;
}

export interface ScoreCalibrationModel {
  version: typeof SCORE_CALIBRATION_MODEL_VERSION;
  intercept: number;
  weights: ScoreCalibrationFeatures;
  sampleCount: number;
  mae: number;
  rmse: number;
  trainedAt: string;
  /** 按 jobId 留出的验证集 MAE（生产决策以此为准） */
  holdoutMae?: number;
  holdoutRmse?: number;
  holdoutSampleCount?: number;
  trainSampleCount?: number;
  holdoutJobCount?: number;
  /** Holdout 中 Semrush 真分 ≥9 的样本数 */
  holdoutPassSampleCount?: number;
  /** 以预测分 ≥9 判定时的通过召回率 */
  holdoutPassRecall?: number;
  /** 以预测分 ≥9 判定时的通过精确率 */
  holdoutPassPrecision?: number;
}

export type ScoreCalibrationConfidence = 'high' | 'medium' | 'low';

export interface ScoreCalibrationPrediction {
  predictedSemrush: number;
  confidence: ScoreCalibrationConfidence;
  modelSampleCount: number;
  usedFallback: boolean;
}

const FEATURE_KEYS: Array<keyof ScoreCalibrationFeatures> = [
  'localScoreNorm',
  'keywordCoverageNorm',
  'serpNorm',
  'structureNorm',
  'readabilityNorm',
  'depthNorm',
  'wordCountNorm',
  'longSentenceNorm',
  'fleschNorm',
  'wordGapNorm',
  'missingKeywordsNorm',
  'semrushNodeNorm',
];

/** 特征中文标签（实验室权重展示） */
export const SCORE_CALIBRATION_FEATURE_LABELS: Record<keyof ScoreCalibrationFeatures, string> = {
  localScoreNorm: '本地总分',
  keywordCoverageNorm: '关键词覆盖',
  serpNorm: 'SERP 对齐',
  structureNorm: '结构',
  readabilityNorm: '可读性',
  depthNorm: '内容深度',
  wordCountNorm: '词数',
  longSentenceNorm: '长句',
  fleschNorm: 'Flesch 对齐度',
  wordGapNorm: '词数缺口',
  missingKeywordsNorm: '缺词数',
  semrushNodeNorm: 'Semrush 节点',
};

export interface ScoreCalibrationFeatureWeightRow {
  key: keyof ScoreCalibrationFeatures;
  label: string;
  weight: number;
  absWeight: number;
}

/** 将 Semrush 3ue 节点映射为 0–1 启发式（可读性/缺词类节点偏高） */
export function encodeSemrushNodeNorm(node?: string): number {
  if (!node?.trim()) return 0;
  const key = node.toLowerCase();
  if (/read|flesch|hard|complex|sentence|paragraph|passive/.test(key)) return 0.85;
  if (/keyword|term|phrase|swa|coverage|density/.test(key)) return 0.65;
  if (/word|length|count|volume/.test(key)) return 0.55;
  return 0.4;
}

const RIDGE_LAMBDA = 0.05;

function clampScore(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 按 |weight| 降序列出模型特征权重 */
export function listScoreCalibrationModelWeights(
  model: ScoreCalibrationModel,
): ScoreCalibrationFeatureWeightRow[] {
  return FEATURE_KEYS.map((key) => {
    const weight = model.weights[key] ?? 0;
    return {
      key,
      label: SCORE_CALIBRATION_FEATURE_LABELS[key],
      weight: round2(weight),
      absWeight: round2(Math.abs(weight)),
    };
  }).sort((a, b) => b.absWeight - a.absWeight);
}

export interface ScoreCalibrationFeatureDriver {
  key: keyof ScoreCalibrationFeatures;
  label: string;
  /** weight × (value − mean)，正值抬高预测、负值压低 */
  contribution: number;
  featureValue: number;
  meanValue: number;
  direction: 'raises' | 'lowers';
}

/** 从样本集计算各特征均值（归因 baseline） */
export function computeScoreCalibrationFeatureMeans(
  featureRows: ScoreCalibrationFeatures[],
): ScoreCalibrationFeatures {
  if (featureRows.length === 0) {
    return FEATURE_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: 0 }),
      {} as ScoreCalibrationFeatures,
    );
  }
  const sums = FEATURE_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as ScoreCalibrationFeatures,
  );
  for (const row of featureRows) {
    for (const key of FEATURE_KEYS) {
      sums[key] += row[key];
    }
  }
  return FEATURE_KEYS.reduce(
    (acc, key) => ({
      ...acc,
      [key]: round2(sums[key] / featureRows.length),
    }),
    {} as ScoreCalibrationFeatures,
  );
}

/** 相对训练均值的 Top-N 预测驱动因素（线性归因） */
export function attributeScoreCalibrationDrivers(input: {
  model: ScoreCalibrationModel;
  features: ScoreCalibrationFeatures;
  featureMeans: ScoreCalibrationFeatures;
  limit?: number;
}): ScoreCalibrationFeatureDriver[] {
  const limit = input.limit ?? 3;
  const drivers = FEATURE_KEYS.map((key) => {
    const featureValue = input.features[key];
    const meanValue = input.featureMeans[key];
    const weight = input.model.weights[key] ?? 0;
    const contribution = round2(weight * (featureValue - meanValue));
    return {
      key,
      label: SCORE_CALIBRATION_FEATURE_LABELS[key],
      contribution,
      featureValue: round2(featureValue),
      meanValue: round2(meanValue),
      direction: contribution >= 0 ? ('raises' as const) : ('lowers' as const),
    };
  });
  return drivers
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, limit);
}

export function buildCalibrationFeatures(input: {
  localScore: number;
  breakdown?: LocalSeoScoreBreakdown;
  metrics?: LocalSeoScoreResult['metrics'];
  semrushContext?: ScoreCalibrationSemrushContext;
}): ScoreCalibrationFeatures {
  const breakdown = input.breakdown;
  const metrics = input.metrics;
  const semrushContext = input.semrushContext;
  const wordCount = metrics?.wordCount ?? 0;
  const longSentences = metrics?.longSentencesOver22 ?? 0;
  const flesch = metrics?.fleschReadingEase ?? 50;
  const fleschTarget = metrics?.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT;
  const wordGap = resolveCalibrationWordGap({
    wordCount,
    competitorWordCount: semrushContext?.competitorWordCount,
    targetWordCount: semrushContext?.targetWordCount,
  });
  const missingKeywords = semrushContext?.missingKeywordCount ?? 0;

  return {
    localScoreNorm: clampScore(input.localScore / 100, 0, 1),
    keywordCoverageNorm: clampScore((breakdown?.keywordCoverage ?? 0) / 25, 0, 1),
    serpNorm: clampScore((breakdown?.serpTermAlignment ?? 0) / 25, 0, 1),
    structureNorm: clampScore((breakdown?.structure ?? 0) / 20, 0, 1),
    readabilityNorm: clampScore((breakdown?.readability ?? 0) / 20, 0, 1),
    depthNorm: clampScore((breakdown?.contentDepth ?? 0) / 10, 0, 1),
    wordCountNorm: clampScore(wordCount / 2000, 0, 1),
    longSentenceNorm: clampScore(longSentences / 10, 0, 1),
    fleschNorm: clampScore(1 - Math.abs(flesch - fleschTarget) / 50, 0, 1),
    wordGapNorm: clampScore(Math.max(0, wordGap) / 400, 0, 1),
    missingKeywordsNorm: clampScore(missingKeywords / 12, 0, 1),
    semrushNodeNorm: encodeSemrushNodeNorm(semrushContext?.semrushNode),
  };
}

function featureVector(features: ScoreCalibrationFeatures): number[] {
  return FEATURE_KEYS.map((key) => features[key]);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const aug = matrix.map((row, i) => [...row, vector[i] ?? 0]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(aug[row]?.[col] ?? 0) > Math.abs(aug[pivot]?.[col] ?? 0)) {
        pivot = row;
      }
    }
    const pivotRow = aug[pivot];
    if (!pivotRow || Math.abs(pivotRow[col] ?? 0) < 1e-9) {
      return null;
    }
    if (pivot !== col) {
      [aug[col], aug[pivot]] = [aug[pivot]!, aug[col]!];
    }
    for (let row = col + 1; row < n; row += 1) {
      const target = aug[row];
      if (!target) continue;
      const factor = (target[col] ?? 0) / (aug[col]?.[col] ?? 1);
      for (let j = col; j <= n; j += 1) {
        target[j] = (target[j] ?? 0) - factor * (aug[col]?.[j] ?? 0);
      }
    }
  }

  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = aug[row]?.[n] ?? 0;
    for (let col = row + 1; col < n; col += 1) {
      sum -= (aug[row]?.[col] ?? 0) * (solution[col] ?? 0);
    }
    const denom = aug[row]?.[row] ?? 0;
    if (Math.abs(denom) < 1e-9) return null;
    solution[row] = sum / denom;
  }
  return solution;
}

function evaluateModel(
  intercept: number,
  weights: ScoreCalibrationFeatures,
  row: ScoreCalibrationTrainingRow,
): number {
  const vec = featureVector(row.features);
  const weightVec = featureVector(weights);
  let sum = intercept;
  for (let i = 0; i < vec.length; i += 1) {
    sum += (weightVec[i] ?? 0) * (vec[i] ?? 0);
  }
  return clampScore(sum, 0, 10);
}

function computeErrors(
  intercept: number,
  weights: ScoreCalibrationFeatures,
  rows: ScoreCalibrationTrainingRow[],
): { mae: number; rmse: number } {
  if (rows.length === 0) {
    return { mae: 0, rmse: 0 };
  }
  let absSum = 0;
  let sqSum = 0;
  for (const row of rows) {
    const predicted = evaluateModel(intercept, weights, row);
    const err = predicted - row.semrushOverall;
    absSum += Math.abs(err);
    sqSum += err * err;
  }
  const mae = absSum / rows.length;
  const rmse = Math.sqrt(sqSum / rows.length);
  return { mae: round2(mae), rmse: round2(rmse) };
}

function computePassClassification(
  intercept: number,
  weights: ScoreCalibrationFeatures,
  rows: ScoreCalibrationTrainingRow[],
): { passSampleCount: number; recall: number; precision: number } {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const row of rows) {
    const actualPass = row.semrushOverall >= 9;
    const predictedPass = evaluateModel(intercept, weights, row) >= 9;
    if (actualPass && predictedPass) truePositive += 1;
    else if (!actualPass && predictedPass) falsePositive += 1;
    else if (actualPass) falseNegative += 1;
  }
  const passSampleCount = truePositive + falseNegative;
  return {
    passSampleCount,
    recall: passSampleCount > 0 ? round2(truePositive / passSampleCount) : 0,
    precision:
      truePositive + falsePositive > 0
        ? round2(truePositive / (truePositive + falsePositive))
        : 0,
  };
}

function splitRowsByJobId(rows: ScoreCalibrationTrainingRow[]): {
  train: ScoreCalibrationTrainingRow[];
  holdout: ScoreCalibrationTrainingRow[];
} {
  const holdoutJobSet = resolveHoldoutJobIds(rows);
  if (holdoutJobSet.size === 0) {
    return { train: rows, holdout: [] };
  }

  const train: ScoreCalibrationTrainingRow[] = [];
  const holdout: ScoreCalibrationTrainingRow[] = [];
  for (const row of rows) {
    if (row.jobId && holdoutJobSet.has(row.jobId)) {
      holdout.push(row);
    } else {
      train.push(row);
    }
  }

  if (train.length < SCORE_CALIBRATION_MIN_SAMPLES || holdout.length === 0) {
    return { train: rows, holdout: [] };
  }

  return { train, holdout };
}

/** 与训练时一致的 holdout 任务 ID 集合（按 jobId 排序后取末 20%） */
export function resolveHoldoutJobIds(rows: ScoreCalibrationTrainingRow[]): Set<string> {
  const jobIds = [...new Set(rows.map((row) => row.jobId).filter((id): id is string => Boolean(id)))];
  if (jobIds.length < SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT) {
    return new Set();
  }

  const holdoutJobCount = Math.max(1, Math.floor(jobIds.length * SCORE_CALIBRATION_HOLDOUT_JOB_RATIO));
  const sortedJobIds = [...jobIds].sort();
  return new Set(sortedJobIds.slice(-holdoutJobCount));
}

function fitLinearModel(rows: ScoreCalibrationTrainingRow[]): {
  intercept: number;
  weights: ScoreCalibrationFeatures;
} | null {
  if (rows.length === 0) return null;

  const dim = FEATURE_KEYS.length + 1;
  const xtx = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const xty = new Array<number>(dim).fill(0);

  for (const row of rows) {
    const x = [1, ...featureVector(row.features)];
    const y = row.semrushOverall;
    for (let i = 0; i < dim; i += 1) {
      xty[i] = (xty[i] ?? 0) + (x[i] ?? 0) * y;
      for (let j = 0; j < dim; j += 1) {
        xtx[i]![j] = (xtx[i]?.[j] ?? 0) + (x[i] ?? 0) * (x[j] ?? 0);
      }
    }
  }

  for (let i = 1; i < dim; i += 1) {
    xtx[i]![i] = (xtx[i]?.[i] ?? 0) + RIDGE_LAMBDA;
  }

  const solved = solveLinearSystem(xtx, xty);
  if (!solved) return null;

  const intercept = solved[0] ?? 0;
  const weights = FEATURE_KEYS.reduce((acc, key, index) => {
    acc[key] = solved[index + 1] ?? 0;
    return acc;
  }, {} as ScoreCalibrationFeatures);

  return { intercept, weights };
}

/** 岭回归拟合 Semrush Overall；样本不足时返回 null */
export function trainScoreCalibrationModel(
  rows: ScoreCalibrationTrainingRow[],
): ScoreCalibrationModel | null {
  if (rows.length < SCORE_CALIBRATION_MIN_SAMPLES) {
    return null;
  }

  const { train, holdout } = splitRowsByJobId(rows);
  const fitted = fitLinearModel(train);
  if (!fitted) {
    return null;
  }

  const { intercept, weights } = fitted;
  const { mae, rmse } = computeErrors(intercept, weights, train);
  const holdoutErrors =
    holdout.length > 0 ? computeErrors(intercept, weights, holdout) : undefined;
  const holdoutPass =
    holdout.length > 0 ? computePassClassification(intercept, weights, holdout) : undefined;

  return {
    version: SCORE_CALIBRATION_MODEL_VERSION,
    intercept: round2(intercept),
    weights,
    sampleCount: train.length,
    trainSampleCount: train.length,
    mae,
    rmse,
    holdoutMae: holdoutErrors?.mae,
    holdoutRmse: holdoutErrors?.rmse,
    holdoutSampleCount: holdout.length > 0 ? holdout.length : undefined,
    holdoutJobCount:
      holdout.length > 0
        ? new Set(holdout.map((row) => row.jobId).filter(Boolean)).size
        : undefined,
    holdoutPassSampleCount: holdoutPass?.passSampleCount,
    holdoutPassRecall: holdoutPass?.recall,
    holdoutPassPrecision: holdoutPass?.precision,
    trainedAt: new Date().toISOString(),
  };
}

/** 生产门控用有效 MAE：仅有 holdout 时才可信 */
export function resolveModelEvalMae(model: ScoreCalibrationModel | null): number | null {
  if (!model || !model.holdoutSampleCount || model.holdoutSampleCount <= 0) {
    return null;
  }
  return model.holdoutMae ?? null;
}

function resolveConfidence(model: ScoreCalibrationModel | null): ScoreCalibrationConfidence {
  if (!model) return 'low';

  const evalMae = resolveModelEvalMae(model);
  if (evalMae === null) return 'low';

  if (
    (model.holdoutSampleCount ?? 0) >= 15 &&
    evalMae <= 0.3 &&
    (model.trainSampleCount ?? model.sampleCount) >= 30 &&
    (model.holdoutPassSampleCount ?? 0) >= 3 &&
    (model.holdoutPassRecall ?? 0) >= 0.6
  ) {
    return 'high';
  }
  if ((model.holdoutSampleCount ?? 0) >= 8 && evalMae <= 0.45) {
    return 'medium';
  }
  return 'low';
}

/**
 * 无校准模型时：按 Semrush SWA 四维权重估算 Overall（0–10）。
 * SEO/篇幅权重高于可读性侧栏红项（与 SWA 9+ 真分现象一致）。
 */
export function estimateSemrushOverallFromFeatures(
  features: ScoreCalibrationFeatures,
  localScore: number,
): number {
  const keywordNorm = features.keywordCoverageNorm;
  const structureNorm = features.structureNorm;
  const naive = localScore / 10;

  const seoNorm = clampScore(
    keywordNorm * 0.65 +
      structureNorm * 0.2 +
      (1 - features.missingKeywordsNorm) * 0.15,
    0,
    1,
  );

  const weighted =
    seoNorm * 0.48 +
    features.readabilityNorm * 0.2 +
    features.serpNorm * 0.12 +
    structureNorm * 0.12 +
    features.depthNorm * 0.08;
  const mapped = weighted * 10;

  const wordAligned =
    features.wordGapNorm <= 0.08 ||
    (features.wordGapNorm <= 0.15 && features.wordCountNorm >= 0.6);

  const shortFormGreenTags =
    features.missingKeywordsNorm === 0 &&
    features.keywordCoverageNorm >= 0.82 &&
    features.wordCountNorm >= 0.25 &&
    features.wordCountNorm < 0.55;

  if (shortFormGreenTags) {
    const nearSwaTarget = features.wordGapNorm <= 0.35;
    const shortOverall = nearSwaTarget
      ? naive +
        0.55 +
        features.keywordCoverageNorm * 0.45 -
        features.wordGapNorm * 0.22
      : 8.8 +
        features.keywordCoverageNorm * 0.3 +
        features.readabilityNorm * 0.2 -
        Math.min(0.3, features.wordGapNorm * 0.25);
    return round2(clampScore(shortOverall, 8.8, nearSwaTarget ? 9.62 : 10));
  }

  const longFormSwaReady =
    features.missingKeywordsNorm === 0 &&
    wordAligned &&
    keywordNorm >= 0.85 &&
    structureNorm >= 0.55 &&
    (features.wordCountNorm >= 0.45 || features.structureNorm >= 0.75);

  if (longFormSwaReady) {
    const boostedStructure = Math.max(structureNorm, 0.88);
    const boostedReadability = Math.max(features.readabilityNorm, 0.78);
    const swaOverall =
      9.05 +
      seoNorm * 0.26 +
      boostedReadability * 0.1 +
      boostedStructure * 0.07 +
      features.serpNorm * 0.04;
    return round2(clampScore(Math.max(Math.min(swaOverall, 9.85), naive * 0.95), 0, 10));
  }

  const capped = Math.min(mapped, naive + 0.8);
  return round2(clampScore(capped, 0, 10));
}

export function predictCalibratedSemrushScore(input: {
  features: ScoreCalibrationFeatures;
  localScore: number;
  model: ScoreCalibrationModel | null;
}): ScoreCalibrationPrediction {
  if (!input.model) {
    return {
      predictedSemrush: estimateSemrushOverallFromFeatures(input.features, input.localScore),
      confidence: 'low',
      modelSampleCount: 0,
      usedFallback: true,
    };
  }

  const predicted = round2(
    evaluateModel(input.model.intercept, input.model.weights, {
      features: input.features,
      semrushOverall: 0,
    }),
  );

  return {
    predictedSemrush: predicted,
    confidence: resolveConfidence(input.model),
    modelSampleCount: input.model.sampleCount,
    usedFallback: false,
  };
}

export function buildCalibrationExportRow(input: {
  jobId: string;
  traceId: string;
  targetKeyword: string;
  snapshotId: string;
  snapshotKind: string;
  checkedAt: string;
  localScore: number;
  semrushOverall: number;
  features: ScoreCalibrationFeatures;
  predictedSemrush?: number;
}): Record<string, unknown> {
  return {
    jobId: input.jobId,
    traceId: input.traceId,
    targetKeyword: input.targetKeyword,
    snapshotId: input.snapshotId,
    snapshotKind: input.snapshotKind,
    checkedAt: input.checkedAt,
    localScore: input.localScore,
    semrushOverall: input.semrushOverall,
    naiveLocalMapped: round2(input.localScore / 10),
    predictedSemrush: input.predictedSemrush,
    features: input.features,
  };
}
