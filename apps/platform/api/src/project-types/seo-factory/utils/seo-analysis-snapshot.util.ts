/**
 * SEO 检测分析快照：append-only，供前端展示与后期训练导出。
 *
 * 边界：
 * - 不负责：DB 写入（SeoCheckerService 调用 append）
 */

import { createHash } from 'node:crypto';
import type { SeoScore } from '@wm/provider-interfaces';
import {
  computeSemrushWordGap,
  LOCAL_SEO_SCORE_VERSION,
  type LocalSeoScoreResult,
} from '@wm/shared-core';

export type SeoAnalysisSnapshotKind =
  | 'local_checkpoint'
  | 'semrush_check'
  | 'semrush_manual_check';

export interface SeoAnalysisSnapshot {
  id: string;
  kind: SeoAnalysisSnapshotKind;
  checkedAt: string;
  round?: number;
  title: string;
  targetKeyword: string;
  submittedKeywords?: string[];
  contentHash: string;
  contentWordCount: number;
  contentPreview: string;
  content?: string;
  localScore?: number;
  localScoreVersion?: number;
  localBreakdown?: LocalSeoScoreResult['breakdown'];
  localMetrics?: LocalSeoScoreResult['metrics'];
  localSuggestions?: string[];
  semrushOverall?: number;
  semrushNode?: string;
  semrushNodeLabel?: string;
  semrushSuggestions?: string[];
  suggestionDetails?: SeoScore['suggestionDetails'];
  actionableIssues?: SeoScore['actionableIssues'];
  semrushReadabilityScore?: number;
  semrushCurrentWordCount?: number;
  semrushCompetitorWordCount?: number;
  domScore?: number;
  apiScore?: number;
  analysisSource?: SeoScore['analysisSource'];
  semrushEvaluationRoute?: string;
  semrushWordGap?: number;
  semrushMissingKeywordCount?: number;
  semrushTargetKeywords?: string[];
  semrushRecommendedKeywords?: string[];
  semrushMissingTargetKeywords?: string[];
  semrushMissingRecommendedKeywords?: string[];
  keywordCoverage?: SeoScore['keywordCoverage'];
  /** true = semrushOverall 来自校准代理，不可用于训练 */
  calibrationProxy?: boolean;
  /** 旧代理分痕迹（无 calibrationProxy 时兜底排除） */
  calibrationPredicted?: number;
  /** Semrush RPA 实际完成时间（与 checkedAt 快照写入时间区分） */
  rpaCheckedAt?: string;
  /** 优化轮候选稿未采纳、已回滚到历史最优 */
  rolledBack?: boolean;
  /** true = 实验室手动从训练集排除（任务与快照保留） */
  excludedFromCalibration?: boolean;
}

const MAX_SNAPSHOTS_PER_JOB = 80;

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function countWords(content: string): number {
  return content.split(/\s+/).filter((w) => w.trim().length > 0).length;
}

export function extractDraftTitle(content: string, targetKeyword: string): string {
  const fromH1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (fromH1) return fromH1.slice(0, 200);
  const firstLine = content.split('\n').map((l) => l.trim()).find(Boolean);
  if (firstLine && !firstLine.startsWith('#')) return firstLine.slice(0, 200);
  return targetKeyword.slice(0, 200) || '(untitled)';
}

export function buildLocalAnalysisSnapshot(input: {
  content: string;
  targetKeyword: string;
  localResult: LocalSeoScoreResult;
  round?: number;
  includeFullContent?: boolean;
}): SeoAnalysisSnapshot {
  const title = extractDraftTitle(input.content, input.targetKeyword);
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'local_checkpoint',
    checkedAt: new Date().toISOString(),
    round: input.round,
    title,
    targetKeyword: input.targetKeyword,
    contentHash: hashContent(input.content),
    contentWordCount: countWords(input.content),
    contentPreview: input.content.trim().slice(0, 480),
    content: input.includeFullContent ? input.content : undefined,
    localScore: input.localResult.score,
    localScoreVersion: LOCAL_SEO_SCORE_VERSION,
    localBreakdown: input.localResult.breakdown,
    localMetrics: input.localResult.metrics,
    localSuggestions: input.localResult.suggestions,
  };
}

export function buildSemrushAnalysisSnapshot(input: {
  content: string;
  targetKeyword: string;
  submittedKeywords?: string[];
  semrushResult: SeoScore;
  localResult?: LocalSeoScoreResult;
  round?: number;
  kind?: SeoAnalysisSnapshotKind;
  includeFullContent?: boolean;
  semrushMissingKeywordCount?: number;
  rolledBack?: boolean;
}): SeoAnalysisSnapshot {
  const kind = input.kind ?? 'semrush_check';
  const title = extractDraftTitle(input.content, input.targetKeyword);
  const record = input.semrushResult.semrushCheckRecord;

  return {
    id: `semrush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    checkedAt: new Date().toISOString(),
    rpaCheckedAt: record?.checkedAt,
    round: input.round,
    title,
    targetKeyword: input.targetKeyword,
    submittedKeywords:
      input.submittedKeywords ??
      record?.submittedKeywords ??
      input.semrushResult.semrushTargetKeywords,
    contentHash: record?.contentHash ?? hashContent(input.content),
    contentWordCount: countWords(input.content),
    contentPreview: input.content.trim().slice(0, 480),
    content: input.includeFullContent ? input.content : undefined,
    localScore: input.localResult?.score,
    localScoreVersion: input.localResult ? LOCAL_SEO_SCORE_VERSION : undefined,
    localBreakdown: input.localResult?.breakdown,
    localMetrics: input.localResult?.metrics,
    semrushOverall: input.semrushResult.skipped ? undefined : input.semrushResult.overall,
    semrushNode: input.semrushResult.node ?? record?.nodeKey,
    semrushNodeLabel: input.semrushResult.nodeLabel,
    semrushSuggestions: input.semrushResult.suggestions,
    suggestionDetails: input.semrushResult.suggestionDetails,
    actionableIssues: input.semrushResult.actionableIssues,
    semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
    semrushCurrentWordCount: input.semrushResult.semrushCurrentWordCount,
    semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
    domScore: record?.domScore,
    apiScore: record?.apiScore,
    analysisSource: input.semrushResult.analysisSource,
    semrushEvaluationRoute: input.semrushResult.semrushEvaluationRoute,
    semrushWordGap:
      computeSemrushWordGap(
        input.semrushResult.semrushCurrentWordCount,
        input.semrushResult.semrushCompetitorWordCount,
      ) ?? undefined,
    semrushMissingKeywordCount: input.semrushMissingKeywordCount,
    semrushTargetKeywords: input.semrushResult.semrushTargetKeywords,
    semrushRecommendedKeywords: input.semrushResult.semrushRecommendedKeywords,
    semrushMissingTargetKeywords: input.semrushResult.semrushMissingTargetKeywords,
    semrushMissingRecommendedKeywords:
      input.semrushResult.semrushMissingRecommendedKeywords,
    keywordCoverage: input.semrushResult.keywordCoverage,
    calibrationProxy: input.semrushResult.calibrationProxy === true,
    calibrationPredicted: input.semrushResult.calibrationPredicted,
    rolledBack: input.rolledBack === true ? true : undefined,
  };
}

function buildSnapshotDedupeKey(snapshot: SeoAnalysisSnapshot): string {
  if (snapshot.kind === 'local_checkpoint') {
    return `${snapshot.kind}|${snapshot.contentHash}|${snapshot.round ?? ''}|${snapshot.localScore ?? ''}`;
  }
  const rpaAt = snapshot.rpaCheckedAt ?? snapshot.checkedAt;
  return `${snapshot.kind}|${snapshot.contentHash}|${rpaAt}|${snapshot.semrushOverall ?? ''}`;
}

/** 追加快照到 seoCheckData（只增不改，超出上限保留最新 N 条） */
export function appendSeoAnalysisSnapshot(
  seoCheckData: Record<string, unknown>,
  snapshot: SeoAnalysisSnapshot,
): Record<string, unknown> {
  const prev = Array.isArray(seoCheckData.analysisSnapshots)
    ? (seoCheckData.analysisSnapshots as SeoAnalysisSnapshot[])
    : [];

  const dedupeKey = buildSnapshotDedupeKey(snapshot);
  const last = prev[prev.length - 1];
  const lastKey = last ? buildSnapshotDedupeKey(last) : '';
  if (dedupeKey === lastKey) {
    return seoCheckData;
  }

  const next = [...prev, snapshot].slice(-MAX_SNAPSHOTS_PER_JOB);
  return { ...seoCheckData, analysisSnapshots: next };
}
