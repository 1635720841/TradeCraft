/**
 * SEO 优化流水线纯函数：续跑判定、轮次上限、Semrush 验收判定。
 * 供 SeoCheckerService 与单元测试共用。
 */
import {
  LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS,
  LOCAL_SEO_NEAR_MISS_MARGIN,
  LOCAL_SEO_PASS_THRESHOLD,
  LOCAL_SEO_RETRY_EXTRA_ROUNDS,
  SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  SEMRUSH_NEAR_MISS_EXTRA_ROUNDS,
  SEMRUSH_NEAR_MISS_MARGIN,
  SEMRUSH_PASS_THRESHOLD,
  SEMRUSH_RETRY_EXTRA_ROUNDS,
  SEMRUSH_ULTRA_NEAR_MISS_EXTRA_ROUNDS,
  SEMRUSH_ULTRA_NEAR_MISS_MARGIN,
  SEMRUSH_SCORE_ROLLBACK_TOLERANCE,
} from '../constants/seo-score';

export interface SeoOptimizeHistoryEntry {
  phase: 'local' | 'semrush';
  round: number;
  kind?: 'baseline' | 'optimize';
}

export interface SeoPersistedCheckData {
  local?: { score?: number; passed?: boolean };
  semrush?: {
    skipped?: boolean;
    passed?: boolean;
    overall?: number;
  };
}

export function hasOptimizeBaseline(
  history: SeoOptimizeHistoryEntry[],
  phase: 'local' | 'semrush',
): boolean {
  return history.some(
    (entry) => entry.phase === phase && (entry.kind === 'baseline' || entry.round === 0),
  );
}

export function countOptimizeRounds(
  history: SeoOptimizeHistoryEntry[],
  phase: 'local' | 'semrush',
): number {
  return history.filter((entry) => entry.phase === phase && entry.kind === 'optimize').length;
}

/** 本地已达标时跳过本地优化（续跑 Semrush） */
export function shouldSkipLocalOptimization(
  localSeoScore: number | null | undefined,
  seoCheck: SeoPersistedCheckData,
): boolean {
  return (localSeoScore ?? 0) >= LOCAL_SEO_PASS_THRESHOLD || seoCheck.local?.passed === true;
}

/** 续跑 Semrush 时跳过本地优化与进门闸（Semrush 优先下本地分可能已下降） */
export function shouldSkipLocalPipeline(
  localAlreadyPassed: boolean,
  semrushResumable: boolean,
): boolean {
  return localAlreadyPassed || semrushResumable;
}

/** Semrush 未达标且有初检基线时可续跑，不重复 RPA 初检 */
export function canResumeSemrushOptimization(
  semrushScore: number | null | undefined,
  seoCheck: SeoPersistedCheckData,
  history: SeoOptimizeHistoryEntry[],
): boolean {
  if (semrushScore == null || semrushScore >= SEMRUSH_PASS_THRESHOLD) return false;
  const semrush = seoCheck.semrush;
  if (!semrush || semrush.skipped || semrush.passed === true) return false;
  return hasOptimizeBaseline(history, 'semrush');
}

export function resolveLocalOptimizeRoundCap(
  bestScore: number,
  completedRounds: number,
  isLocalResume: boolean,
): number {
  let cap = LOCAL_SEO_MAX_OPTIMIZE_ROUNDS;
  if (bestScore >= LOCAL_SEO_PASS_THRESHOLD - LOCAL_SEO_NEAR_MISS_MARGIN) {
    cap += LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS;
  }
  if (bestScore === LOCAL_SEO_PASS_THRESHOLD - 1) {
    cap += 2;
  }
  if (isLocalResume && completedRounds >= LOCAL_SEO_MAX_OPTIMIZE_ROUNDS) {
    cap = Math.max(cap, completedRounds + LOCAL_SEO_RETRY_EXTRA_ROUNDS);
  }
  return cap;
}

export function resolveSemrushOptimizeRoundCap(
  bestScore: number,
  completedRounds: number,
  isSemrushResume: boolean,
): number {
  let cap = SEMRUSH_MAX_OPTIMIZE_ROUNDS;
  if (bestScore >= SEMRUSH_PASS_THRESHOLD - SEMRUSH_NEAR_MISS_MARGIN) {
    cap += SEMRUSH_NEAR_MISS_EXTRA_ROUNDS;
  }
  if (bestScore >= SEMRUSH_PASS_THRESHOLD - SEMRUSH_ULTRA_NEAR_MISS_MARGIN) {
    cap += SEMRUSH_ULTRA_NEAR_MISS_EXTRA_ROUNDS;
  }
  if (isSemrushResume) {
    cap = Math.max(cap, completedRounds + SEMRUSH_RETRY_EXTRA_ROUNDS);
  }
  return cap;
}

/** Semrush 优化轮：分数提升、达标、RPA 容差、缺词减少或可读性改善时保留 */
export interface SemrushCandidateAcceptInput {
  candidateOverall: number;
  bestOverall: number;
  candidateMissingKeywordCount: number;
  bestMissingKeywordCount: number;
  readabilityImproved?: boolean;
}

export function shouldAcceptSemrushCandidate(input: SemrushCandidateAcceptInput): boolean {
  if (input.candidateOverall >= SEMRUSH_PASS_THRESHOLD) return true;
  if (input.candidateOverall >= input.bestOverall) return true;
  if (input.candidateOverall >= input.bestOverall - SEMRUSH_SCORE_ROLLBACK_TOLERANCE) {
    return true;
  }
  if (
    input.candidateMissingKeywordCount < input.bestMissingKeywordCount &&
    input.candidateOverall >= input.bestOverall - 0.15
  ) {
    return true;
  }
  if (input.readabilityImproved && input.candidateOverall >= input.bestOverall - 0.1) {
    return true;
  }
  return false;
}
/** 本地优化轮：允许 near-miss 2 分波动，但 keywordCoverage 掉分绝对拒绝 */
export function shouldAcceptLocalCandidate(input: {
  candidateScore: number;
  bestScore: number;
  candidateKeywordCoverage: number;
  bestKeywordCoverage: number;
  nearMiss: boolean;
  readabilityImproved: boolean;
}): boolean {
  if (input.candidateKeywordCoverage < input.bestKeywordCoverage) return false;
  if (input.candidateScore >= input.bestScore) return true;
  return (
    input.nearMiss &&
    input.readabilityImproved &&
    input.candidateScore >= input.bestScore - 2
  );
}
