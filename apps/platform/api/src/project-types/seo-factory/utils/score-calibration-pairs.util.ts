/**
 * 从 ArticleJob seoCheckData 提取本地分与 Semrush 真分配对样本。
 *
 * 边界：
 * - 不负责：模型训练（shared-core score-calibration-model）
 * - 不负责：纳入校准代理分（calibrationProxy）或同任务多轮重复样本
 */

import {
  buildCalibrationFeatures,
  type ScoreCalibrationFeatures,
  type ScoreCalibrationTrainingRow,
} from '@wm/shared-core';
import type { SeoAnalysisSnapshot } from './seo-analysis-snapshot.util';
import {
  resolveSnapshotLocalMetrics,
  resolveSnapshotSemrushContext,
} from './score-calibration-snapshot-context.util';
import { isCalibrationLabImportSeoCheckData } from './score-calibration-manual-samples.util';

export interface ScoreCalibrationPairRecord {
  jobId: string;
  traceId: string;
  targetKeyword: string;
  snapshotId: string;
  snapshotKind: SeoAnalysisSnapshot['kind'];
  checkedAt: string;
  title: string;
  contentHash: string;
  contentWordCount: number;
  localScore: number;
  semrushOverall: number;
  naiveMapped: number;
  absError: number;
  signedError: number;
  features: ScoreCalibrationFeatures;
  localBreakdown?: SeoAnalysisSnapshot['localBreakdown'];
  semrushNodeLabel?: string;
  missingKeywordsBackfilled?: boolean;
}

export interface ScoreCalibrationBucketStat {
  label: string;
  count: number;
  avgAbsError: number;
}

export interface ScoreCalibrationPairExtractionMeta {
  rawPairCount: number;
  excludedPairCount: number;
  excludedProxyCount: number;
  excludedLegacyProxyCount: number;
  excludedKindCount: number;
  dedupedJobCount: number;
  /** 缺词数由正文回填的配对数（去重后） */
  backfilledMissingKeywordCount: number;
}

export interface ScoreCalibrationCoverage {
  totalJobs: number;
  jobsWithTrainablePair: number;
  jobsWithoutTrainablePair: number;
  sampleJobIdsWithoutPair: string[];
}

export interface JobSnapshotSource {
  id: string;
  traceId: string;
  targetKeyword: string;
  seoCheckData: unknown;
}

const TRAINABLE_SNAPSHOT_KINDS = new Set<SeoAnalysisSnapshot['kind']>([
  'semrush_check',
  'semrush_manual_check',
]);

function asSnapshots(seoCheckData: unknown): SeoAnalysisSnapshot[] {
  const data = (seoCheckData ?? {}) as { analysisSnapshots?: SeoAnalysisSnapshot[] };
  return Array.isArray(data.analysisSnapshots) ? data.analysisSnapshots : [];
}

function toPairRecord(job: JobSnapshotSource, snapshot: SeoAnalysisSnapshot): ScoreCalibrationPairRecord {
  const { context, missingKeywordsBackfilled } = resolveSnapshotSemrushContext(
    snapshot,
    job.targetKeyword,
  );
  const features = buildCalibrationFeatures({
    localScore: snapshot.localScore!,
    breakdown: snapshot.localBreakdown,
    metrics: resolveSnapshotLocalMetrics(snapshot),
    semrushContext: context,
  });
  const naiveMapped = Math.round((snapshot.localScore! / 10) * 100) / 100;
  const signedError = Math.round((naiveMapped - snapshot.semrushOverall!) * 100) / 100;
  const absError = Math.round(Math.abs(signedError) * 100) / 100;

  return {
    jobId: job.id,
    traceId: job.traceId,
    targetKeyword: snapshot.targetKeyword || job.targetKeyword,
    snapshotId: snapshot.id,
    snapshotKind: snapshot.kind,
    checkedAt: snapshot.checkedAt,
    title: snapshot.title,
    contentHash: snapshot.contentHash,
    contentWordCount: snapshot.contentWordCount,
    localScore: snapshot.localScore!,
    semrushOverall: snapshot.semrushOverall!,
    naiveMapped,
    absError,
    signedError,
    features,
    localBreakdown: snapshot.localBreakdown,
    semrushNodeLabel: snapshot.semrushNodeLabel,
    missingKeywordsBackfilled,
  };
}

/** 同任务只保留最新一条真 RPA 快照（按 checkedAt） */
function dedupeLatestRealPairPerJob(pairs: ScoreCalibrationPairRecord[]): ScoreCalibrationPairRecord[] {
  const sorted = [...pairs].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  const byJob = new Map<string, ScoreCalibrationPairRecord>();
  for (const pair of sorted) {
    if (!byJob.has(pair.jobId)) {
      byJob.set(pair.jobId, pair);
    }
  }
  return [...byJob.values()].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

/** 从项目内任务快照提取可训练配对（过滤代理分 + 按任务去重） */
export function extractScoreCalibrationPairs(jobs: JobSnapshotSource[]): {
  pairs: ScoreCalibrationPairRecord[];
  meta: ScoreCalibrationPairExtractionMeta;
} {
  let rawPairCount = 0;
  let excludedPairCount = 0;
  let excludedProxyCount = 0;
  let excludedLegacyProxyCount = 0;
  let excludedKindCount = 0;
  const rawPairs: ScoreCalibrationPairRecord[] = [];

  for (const job of jobs) {
    for (const snapshot of asSnapshots(job.seoCheckData)) {
      if (typeof snapshot.localScore !== 'number' || typeof snapshot.semrushOverall !== 'number') {
        continue;
      }
      rawPairCount += 1;
      if (snapshot.calibrationProxy === true) {
        excludedProxyCount += 1;
        continue;
      }
      if (typeof snapshot.calibrationPredicted === 'number') {
        excludedLegacyProxyCount += 1;
        continue;
      }
      if (!TRAINABLE_SNAPSHOT_KINDS.has(snapshot.kind)) {
        excludedKindCount += 1;
        continue;
      }
      if (snapshot.excludedFromCalibration === true) {
        excludedPairCount += 1;
        continue;
      }
      rawPairs.push(toPairRecord(job, snapshot));
    }
  }

  const pairs = dedupeLatestRealPairPerJob(rawPairs);
  const backfilledMissingKeywordCount = pairs.filter(
    (pair) => pair.missingKeywordsBackfilled,
  ).length;

  return {
    pairs,
    meta: {
      rawPairCount,
      excludedPairCount,
      excludedProxyCount,
      excludedLegacyProxyCount,
      excludedKindCount,
      dedupedJobCount: pairs.length,
      backfilledMissingKeywordCount,
    },
  };
}

/** 统计项目内缺训练样本的任务（用于实验室行动指引） */
export function buildCalibrationCoverage(
  jobs: Array<{ id: string }>,
  pairs: ScoreCalibrationPairRecord[],
): ScoreCalibrationCoverage {
  const pairedJobIds = new Set(pairs.map((pair) => pair.jobId));
  const withoutPair = jobs.filter((job) => !pairedJobIds.has(job.id)).map((job) => job.id);
  return {
    totalJobs: jobs.length,
    jobsWithTrainablePair: pairedJobIds.size,
    jobsWithoutTrainablePair: withoutPair.length,
    sampleJobIdsWithoutPair: withoutPair.slice(0, 8),
  };
}

/** 已排除的流程 RPA 配对（供实验室恢复） */
export function extractExcludedScoreCalibrationPairs(
  jobs: JobSnapshotSource[],
): ScoreCalibrationPairRecord[] {
  const excluded: ScoreCalibrationPairRecord[] = [];
  for (const job of jobs) {
    if (isCalibrationLabImportSeoCheckData(job.seoCheckData)) {
      continue;
    }
    for (const snapshot of asSnapshots(job.seoCheckData)) {
      if (snapshot.excludedFromCalibration !== true) {
        continue;
      }
      if (typeof snapshot.localScore !== 'number' || typeof snapshot.semrushOverall !== 'number') {
        continue;
      }
      if (snapshot.kind !== 'semrush_check') {
        continue;
      }
      excluded.push(toPairRecord(job, snapshot));
    }
  }
  return excluded.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

export function toCalibrationTrainingRows(
  pairs: ScoreCalibrationPairRecord[],
): ScoreCalibrationTrainingRow[] {
  return pairs.map((pair) => ({
    jobId: pair.jobId,
    features: pair.features,
    semrushOverall: pair.semrushOverall,
  }));
}

export function buildErrorBucketStats(pairs: ScoreCalibrationPairRecord[]): ScoreCalibrationBucketStat[] {
  const buckets = [
    { label: '≤0.2', min: 0, max: 0.2 },
    { label: '0.2–0.5', min: 0.2, max: 0.5 },
    { label: '0.5–1.0', min: 0.5, max: 1.0 },
    { label: '>1.0', min: 1.0, max: Infinity },
  ];

  return buckets.map((bucket) => {
    const matched = pairs.filter(
      (pair) => pair.absError >= bucket.min && pair.absError < bucket.max,
    );
    const avgAbsError =
      matched.length === 0
        ? 0
        : Math.round(
            (matched.reduce((sum, pair) => sum + pair.absError, 0) / matched.length) * 100,
          ) / 100;
    return {
      label: bucket.label,
      count: matched.length,
      avgAbsError,
    };
  });
}

export function computePairStats(pairs: ScoreCalibrationPairRecord[]): {
  mae: number;
  rmse: number;
  maxAbsError: number;
} {
  if (pairs.length === 0) {
    return { mae: 0, rmse: 0, maxAbsError: 0 };
  }
  let absSum = 0;
  let sqSum = 0;
  let maxAbsError = 0;
  for (const pair of pairs) {
    absSum += pair.absError;
    sqSum += pair.signedError * pair.signedError;
    maxAbsError = Math.max(maxAbsError, pair.absError);
  }
  return {
    mae: Math.round((absSum / pairs.length) * 100) / 100,
    rmse: Math.round(Math.sqrt(sqSum / pairs.length) * 100) / 100,
    maxAbsError: Math.round(maxAbsError * 100) / 100,
  };
}
