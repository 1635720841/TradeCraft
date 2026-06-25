/**
 * 评分校准实验室 API（管理端）。
 */

import { http } from "@/utils/http";
import type { ScoreCalibrationReadinessState } from "@/constants/dicts/score-calibration";
import type { WmApiResponse } from "./types";

export interface ScoreCalibrationModel {
  version: number;
  intercept: number;
  weights: Record<string, number>;
  sampleCount: number;
  mae: number;
  rmse: number;
  trainedAt: string;
  holdoutMae?: number;
  holdoutRmse?: number;
  holdoutSampleCount?: number;
  trainSampleCount?: number;
  holdoutJobCount?: number;
}

export interface ScoreCalibrationReadiness {
  state: ScoreCalibrationReadinessState;
  canTrialReduceRpa: boolean;
  reduceRpaEffective: boolean;
  primaryAction:
    | "collect_rpa_samples"
    | "review_holdout_errors"
    | "enable_reduce_rpa_trial"
    | "enable_reduce_rpa_production"
    | "none";
  gaps: {
    samplesNeeded: number;
    jobsNeeded: number;
    holdoutSamplesNeeded: number;
  };
  holdoutSampleCount: number;
  holdoutMae: number | null;
  trainSampleCount: number;
}

export interface ScoreCalibrationCoverage {
  totalJobs: number;
  jobsWithTrainablePair: number;
  jobsWithoutTrainablePair: number;
  sampleJobIdsWithoutPair: string[];
}

export interface ScoreCalibrationSummary {
  snapshotCount: number;
  jobCount: number;
  extractionMeta?: {
    rawPairCount: number;
    excludedPairCount: number;
    excludedProxyCount: number;
    excludedLegacyProxyCount: number;
    excludedKindCount: number;
    dedupedJobCount: number;
    backfilledMissingKeywordCount: number;
    manualImportCount?: number;
    workflowPairCount?: number;
    manualPairCount?: number;
  };
  coverage: ScoreCalibrationCoverage;
  readiness: ScoreCalibrationReadiness;
  minSamplesRequired: number;
  minJobsForHoldout: number;
  modelReady: boolean;
  holdoutReady: boolean;
  model: ScoreCalibrationModel | null;
  featureWeights: Array<{
    key: string;
    label: string;
    weight: number;
    absWeight: number;
  }>;
  modelIntercept: number | null;
  naiveMapping: { mae: number; rmse: number; maxAbsError: number };
  holdoutNaiveMapping?: { mae: number; rmse: number; maxAbsError: number };
  trainMapping: { mae: number; rmse: number; maxAbsError: number; sampleCount: number };
  holdoutMapping: {
    mae: number;
    rmse: number;
    maxAbsError?: number;
    holdoutSampleCount: number;
    holdoutJobCount: number;
  };
  calibratedMapping: {
    mae: number;
    rmse: number;
    maxAbsError?: number;
    sampleCount?: number;
    holdoutSampleCount?: number;
    holdoutJobCount?: number;
  };
  passThresholds: { local: number; semrush: number };
  localPassRate: number;
  semrushPassRate: number;
  errorBuckets: Array<{ label: string; count: number; avgAbsError: number }>;
  holdoutErrorBuckets?: Array<{ label: string; count: number; avgAbsError: number }>;
  shadowStats?: {
    totalEntries: number;
    rpaSkippedCount: number;
    avgAbsError: number;
    postRpaCount: number;
  };
  holdoutScatterSample: Array<{
    localMapped: number;
    semrushOverall: number;
    predictedSemrush: number;
    absError: number;
    modelAbsError: number;
  }>;
  holdoutHighErrorAttribution?: ScoreCalibrationPairItem[];
  outlierPairCount?: number;
  readinessGates?: ScoreCalibrationReadinessGates;
}

export interface ScoreCalibrationReadinessGates {
  trial: {
    holdoutSamples: { current: number; required: number };
    holdoutMae: { current: number | null; max: number; met: boolean };
  };
  production: {
    holdoutSamples: { current: number; required: number };
    trainSamples: { current: number; required: number };
    holdoutMae: { current: number | null; max: number };
  };
  confidenceNote: string;
}

export interface ScoreCalibrationJobWithoutPair {
  jobId: string;
  targetKeyword: string;
  status: string;
  updatedAt: string;
  semrushScore: number | null;
  localSeoScore: number | null;
}

export interface ScoreCalibrationShadowLogItem {
  id: string;
  jobId: string;
  targetKeyword: string;
  at: string;
  phase: string;
  round?: number;
  localScore: number;
  predictedSemrush: number;
  actualSemrush?: number;
  absError?: number;
  confidence: "high" | "medium" | "low";
  decision?: string;
  reason?: string;
  rpaSkipped: boolean;
}

export interface ManualCalibrationSampleResult {
  sampleId: string;
  jobId: string;
  title: string;
  targetKeyword: string;
  localScore: number;
  semrushOverall: number;
  naiveMapped: number;
  naiveAbsError: number;
  labelWarning?: string | null;
  manualSampleCount: number;
  checkedAt: string;
}

export interface ManualCalibrationSampleItem {
  jobId: string;
  sampleId: string;
  title: string;
  targetKeyword: string;
  localScore: number;
  semrushOverall: number;
  sourceNote?: string;
  importedAt: string;
  checkedAt: string;
}

export interface ManualCalibrationSampleDetail {
  jobId: string;
  sampleId: string;
  targetKeyword: string;
  submittedKeywords: string[];
  content: string;
  semrushOverall: number;
  semrushNodeLabel?: string;
  semrushCurrentWordCount?: number;
  semrushCompetitorWordCount?: number;
  semrushReadabilityScore?: number;
  targetWordCount?: number;
  sourceNote?: string;
  importedAt: string;
  localScore: number;
}

export interface ScoreCalibrationFeatureDriver {
  key: string;
  label: string;
  contribution: number;
  featureValue: number;
  meanValue: number;
  direction: "raises" | "lowers";
}

export interface ScoreCalibrationPairItem {
  jobId: string;
  traceId: string;
  targetKeyword: string;
  snapshotId: string;
  snapshotKind: string;
  checkedAt: string;
  title: string;
  localScore: number;
  semrushOverall: number;
  naiveMapped: number;
  predictedSemrush: number;
  naiveAbsError: number;
  modelAbsError: number | null;
  signedModelError: number | null;
  isHoldout: boolean;
  missingKeywordsBackfilled: boolean;
  localScoreVersion: number | null;
  trainingEligible: boolean;
  topFeatureDrivers: ScoreCalibrationFeatureDriver[];
  /** 全部 12 维特征归因（展开详情用） */
  featureAttribution: ScoreCalibrationFeatureDriver[];
  confidence: "high" | "medium" | "low";
  semrushNodeLabel?: string;
  possiblyOutlier?: boolean;
  outlierReason?: string | null;
}

export interface ScoreCalibrationPredictResult {
  localScore: number;
  localBreakdown: Record<string, number>;
  localSuggestions: string[];
  naiveMapped: number;
  predictedSemrush: number;
  passed: boolean;
  pointsToGo: number;
  confidence: "high" | "medium" | "low";
  modelSampleCount: number;
  usedFallback: boolean;
  evalMae: number | null;
  primaryNode: {
    key: string;
    label: string;
    hint: string;
  };
  missingKeywords: string[];
  missingKeywordCount: number;
  wordCount: {
    current: number;
    competitor: number | null;
    gap: number | null;
  };
  featureAttribution: ScoreCalibrationFeatureDriver[];
  passThresholds: { local: number; semrush: number };
}

export type ScoreReverseFactorKey =
  | "title_compact"
  | "title_near_limit"
  | "title_too_long"
  | "title_missing"
  | "duplicate_heading"
  | "long_paragraph"
  | "long_sentence"
  | "complex_words"
  | "casual_tone"
  | "long_paragraph_strong"
  | "long_sentence_strong"
  | "complex_words_strong"
  | "casual_tone_strong"
  | "tone_hype_strong"
  | "tone_formal_strong"
  | "primary_keyword_missing"
  | "primary_keyword_title_only"
  | "primary_keyword_body_only";

export interface ScoreReverseTrial {
  score: number;
  round?: number;
  nodeLabel?: string;
  nodeKey?: string;
  databaseLabel?: string;
  contentHash?: string;
  keywordSetHash?: string;
  semrushReadabilityScore?: number;
  semrushCurrentWordCount?: number;
  semrushCompetitorWordCount?: number;
  suggestions?: string[];
  suggestionDetails?: Partial<Record<"readability" | "seo" | "tone" | "originality", string[]>>;
  analysisSource?: "api" | "dom" | "mixed";
  checkedAt: string;
}

export interface ScoreReverseVariant {
  key: "baseline" | ScoreReverseFactorKey;
  label: string;
  mutationSummary: string;
  content: string;
  trials: ScoreReverseTrial[];
  medianScore: number | null;
  meanScore: number | null;
  standardDeviation: number | null;
  deltaFromBaseline: number | null;
  pairedDeltaMedian: number | null;
  pairedDeltaStandardDeviation: number | null;
  pairedSampleCount: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  warnings: string[];
}

export interface ScoreReverseRuleEvidence {
  factorKey: ScoreReverseFactorKey;
  label: string;
  experimentCount: number;
  eligibleExperimentCount: number;
  excludedExperimentCount: number;
  articleCount: number;
  nodeCount: number;
  medianDelta: number | null;
  meanDelta: number | null;
  standardDeviation: number | null;
  directionConsistency: number | null;
  confidence: "high" | "medium" | "low";
  status: "candidate" | "replicated" | "validated" | "inconclusive";
  warnings: string[];
}

export interface ScoreReverseAiAnalysis {
  summary: string;
  findings: Array<{
    factorKey: string;
    title: string;
    evidence: string;
    interpretation: string;
    confidence: "high" | "medium" | "low";
  }>;
  limitations: string[];
  nextActions: Array<{
    factorKey?: string;
    title: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  }>;
  promptVersion: string;
  generatedAt: string;
  basedOnUpdatedAt: string;
  stale: boolean;
}

export interface ScoreReverseExperiment {
  id: string;
  name: string;
  targetKeyword: string;
  submittedKeywords: string[];
  baselineContent: string;
  factors: ScoreReverseFactorKey[];
  observations?: Partial<Record<"baseline" | ScoreReverseFactorKey, string>>;
  aiAnalysis?: ScoreReverseAiAnalysis;
  variants: ScoreReverseVariant[];
  baselineSpread: number | null;
  baselineDriftDetected: boolean;
  completedVariants: number;
  totalVariants: number;
  createdAt: string;
  updatedAt: string;
}

function labBase(projectId: string) {
  return `/api/v1/projects/${projectId}/seo-score-lab`;
}

/** 校准就绪状态（轻量，供设置页门控提示） */
export async function getScoreCalibrationReadiness(
  projectId: string
): Promise<ScoreCalibrationReadiness> {
  const res = await http.request<WmApiResponse<ScoreCalibrationReadiness>>(
    "get",
    `${labBase(projectId)}/readiness`
  );
  return res.data;
}

/** 校准实验室概览与模型指标 */
export async function getScoreCalibrationSummary(
  projectId: string
): Promise<ScoreCalibrationSummary> {
  const res = await http.request<WmApiResponse<ScoreCalibrationSummary>>(
    "get",
    `${labBase(projectId)}/summary`
  );
  return res.data;
}

/** 本地分 vs Semrush 配对列表 */
export async function listScoreCalibrationPairs(
  projectId: string,
  options: {
    page?: number;
    limit?: number;
    dataset?: "all" | "holdout" | "train";
    source?: "all" | "workflow" | "manual";
    minAbsError?: number;
    maxAbsError?: number;
    minModelAbsError?: number;
    maxModelAbsError?: number;
  } = {}
): Promise<WmApiResponse<ScoreCalibrationPairItem[]>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 1,
    limit: options.limit ?? 20,
    dataset: options.dataset ?? "all"
  };
  if (options.source && options.source !== "all") params.source = options.source;
  if (options.minAbsError !== undefined) params.minAbsError = options.minAbsError;
  if (options.maxAbsError !== undefined) params.maxAbsError = options.maxAbsError;
  if (options.minModelAbsError !== undefined) params.minModelAbsError = options.minModelAbsError;
  if (options.maxModelAbsError !== undefined) params.maxModelAbsError = options.maxModelAbsError;
  return http.request<WmApiResponse<ScoreCalibrationPairItem[]>>(
    "get",
    `${labBase(projectId)}/pairs`,
    { params }
  );
}

/** 导出训练集 JSON */
export async function exportScoreCalibrationTrainingSet(projectId: string): Promise<{
  rowCount: number;
  exportedAt: string;
  rows: Record<string, unknown>[];
}> {
  const res = await http.request<
    WmApiResponse<{ rowCount: number; exportedAt: string; rows: Record<string, unknown>[] }>
  >("get", `${labBase(projectId)}/export`);
  return res.data;
}

/** 手动样本详情（编辑用） */
export async function getManualCalibrationSample(
  projectId: string,
  jobId: string
): Promise<ManualCalibrationSampleDetail> {
  const res = await http.request<WmApiResponse<ManualCalibrationSampleDetail>>(
    "get",
    `${labBase(projectId)}/samples/${jobId}`
  );
  return res.data;
}

/** 已录入的手动校准样本列表 */
export async function listManualCalibrationSamples(
  projectId: string
): Promise<ManualCalibrationSampleItem[]> {
  const res = await http.request<WmApiResponse<ManualCalibrationSampleItem[]>>(
    "get",
    `${labBase(projectId)}/samples`
  );
  return res.data ?? [];
}

/** 手动录入校准样本（从 Semrush 粘贴正文 + 真分） */
export async function createManualCalibrationSample(
  projectId: string,
  payload: {
    targetKeyword: string;
    content: string;
    semrushOverall: number;
    semrushNodeLabel?: string;
    semrushCurrentWordCount?: number;
    semrushCompetitorWordCount?: number;
    semrushReadabilityScore?: number;
    submittedKeywords?: string[];
    targetWordCount?: number;
    sourceNote?: string;
  }
): Promise<ManualCalibrationSampleResult> {
  const res = await http.request<WmApiResponse<ManualCalibrationSampleResult>>(
    "post",
    `${labBase(projectId)}/samples`,
    { data: payload }
  );
  return res.data;
}

/** 更新手动录入校准样本 */
export async function updateManualCalibrationSample(
  projectId: string,
  jobId: string,
  payload: {
    targetKeyword: string;
    content: string;
    semrushOverall: number;
    semrushNodeLabel?: string;
    semrushCurrentWordCount?: number;
    semrushCompetitorWordCount?: number;
    semrushReadabilityScore?: number;
    submittedKeywords?: string[];
    targetWordCount?: number;
    sourceNote?: string;
  }
): Promise<Omit<ManualCalibrationSampleResult, "manualSampleCount">> {
  const res = await http.request<
    WmApiResponse<Omit<ManualCalibrationSampleResult, "manualSampleCount">>
  >("patch", `${labBase(projectId)}/samples/${jobId}`, { data: payload });
  return res.data;
}

/** 删除手动录入校准样本 */
export async function deleteManualCalibrationSample(
  projectId: string,
  jobId: string
): Promise<{ jobId: string; manualSampleCount: number }> {
  const res = await http.request<
    WmApiResponse<{ jobId: string; manualSampleCount: number }>
  >("delete", `${labBase(projectId)}/samples/${jobId}`);
  return res.data;
}

/** 流程 RPA 配对从训练集排除或恢复 */
export async function setWorkflowPairCalibrationExcluded(
  projectId: string,
  jobId: string,
  snapshotId: string,
  excluded: boolean
): Promise<{
  jobId: string;
  snapshotId: string;
  excluded: boolean;
  activePairCount: number;
  excludedPairCount: number;
}> {
  const res = await http.request<
    WmApiResponse<{
      jobId: string;
      snapshotId: string;
      excluded: boolean;
      activePairCount: number;
      excludedPairCount: number;
    }>
  >("patch", `${labBase(projectId)}/pairs/${jobId}/snapshots/${snapshotId}/excluded`, {
    data: { excluded }
  });
  return res.data;
}

/** 缺真 RPA 配对的文章任务列表 */
export async function listScoreCalibrationJobsWithoutPairs(
  projectId: string,
  options: { page?: number; limit?: number } = {}
): Promise<WmApiResponse<ScoreCalibrationJobWithoutPair[]>> {
  return http.request<WmApiResponse<ScoreCalibrationJobWithoutPair[]>>(
    "get",
    `${labBase(projectId)}/jobs-without-pairs`,
    { params: { page: options.page ?? 1, limit: options.limit ?? 20 } }
  );
}

/** 影子日志：优化轮预测分 vs 真分 */
export async function listScoreCalibrationShadowLogs(
  projectId: string,
  options: { page?: number; limit?: number } = {}
): Promise<WmApiResponse<ScoreCalibrationShadowLogItem[]>> {
  return http.request<WmApiResponse<ScoreCalibrationShadowLogItem[]>>(
    "get",
    `${labBase(projectId)}/shadow-logs`,
    { params: { page: options.page ?? 1, limit: options.limit ?? 20 } }
  );
}

/** 对正文做本地分 + 校准预测 */
export async function predictCalibratedSemrushScore(
  projectId: string,
  payload: {
    targetKeyword: string;
    content: string;
    targetWordCount?: number;
    competitorWordCount?: number;
  }
): Promise<ScoreCalibrationPredictResult> {
  const res = await http.request<WmApiResponse<ScoreCalibrationPredictResult>>(
    "post",
    `${labBase(projectId)}/predict`,
    { data: payload }
  );
  return res.data;
}

/** Semrush 黑盒评分反推实验列表 */
export async function listScoreReverseExperiments(
  projectId: string
): Promise<ScoreReverseExperiment[]> {
  const res = await http.request<WmApiResponse<ScoreReverseExperiment[]>>(
    "get",
    `${labBase(projectId)}/reverse-experiments`
  );
  return res.data ?? [];
}

/** 跨文章聚合的反推规则证据；只有 validated 才允许进入生产候选。 */
export async function getScoreReverseEvidence(
  projectId: string
): Promise<ScoreReverseRuleEvidence[]> {
  const res = await http.request<WmApiResponse<ScoreReverseRuleEvidence[]>>(
    "get",
    `${labBase(projectId)}/reverse-evidence`
  );
  return res.data ?? [];
}

/** 创建基线 + 单变量对照稿 */
export async function createScoreReverseExperiment(
  projectId: string,
  payload: {
    name: string;
    targetKeyword: string;
    submittedKeywords?: string[];
    baselineContent: string;
    factors?: ScoreReverseFactorKey[];
  }
): Promise<ScoreReverseExperiment> {
  const res = await http.request<WmApiResponse<ScoreReverseExperiment>>(
    "post",
    `${labBase(projectId)}/reverse-experiments`,
    { data: payload }
  );
  return res.data;
}

/** 录入某个对照稿的重复 Semrush 检测结果 */
export async function updateScoreReverseTrials(
  projectId: string,
  experimentId: string,
  payload: {
    variantKey: "baseline" | ScoreReverseFactorKey;
    trials: Array<{
      score: number;
      round?: number;
      nodeLabel?: string;
      databaseLabel?: string;
      checkedAt?: string;
    }>;
    observation?: string;
  }
): Promise<ScoreReverseExperiment> {
  const res = await http.request<WmApiResponse<ScoreReverseExperiment>>(
    "patch",
    `${labBase(projectId)}/reverse-experiments/${experimentId}/trials`,
    { data: payload }
  );
  return res.data;
}

/** 自动执行一个版本的一轮真实 Semrush RPA，并把证据写回实验。 */
export async function runScoreReverseTrial(
  projectId: string,
  experimentId: string,
  payload: {
    variantKey: "baseline" | ScoreReverseFactorKey;
    round: number;
    preferredNodeKey?: string;
  }
): Promise<ScoreReverseExperiment> {
  const res = await http.request<WmApiResponse<ScoreReverseExperiment>>(
    "post",
    `${labBase(projectId)}/reverse-experiments/${experimentId}/run-trial`,
    { data: payload, timeout: 600_000 }
  );
  return res.data;
}

/** 基于实验统计生成 AI 证据解读与下一轮建议，不改写任何对照稿。 */
export async function analyzeScoreReverseExperiment(
  projectId: string,
  experimentId: string
): Promise<ScoreReverseExperiment> {
  const res = await http.request<WmApiResponse<ScoreReverseExperiment>>(
    "post",
    `${labBase(projectId)}/reverse-experiments/${experimentId}/ai-analysis`,
    { timeout: 200_000 }
  );
  return res.data;
}

/** 删除反推实验 */
export async function deleteScoreReverseExperiment(
  projectId: string,
  experimentId: string
): Promise<void> {
  await http.request(
    "delete",
    `${labBase(projectId)}/reverse-experiments/${experimentId}`
  );
}
