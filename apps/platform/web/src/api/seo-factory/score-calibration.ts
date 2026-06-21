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
