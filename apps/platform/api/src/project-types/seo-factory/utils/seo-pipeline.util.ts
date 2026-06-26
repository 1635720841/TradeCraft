/**
 * SEO 优化流水线纯函数：续跑判定、轮次上限、Semrush 验收判定。
 * 供 SeoCheckerService 与单元测试共用。
 */
import {
  LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS,
  LOCAL_SEO_NEAR_MISS_MARGIN,
  SEMRUSH_NEAR_MISS_EXTRA_ROUNDS,
  SEMRUSH_NEAR_MISS_MARGIN,
  SEMRUSH_SCORE_ROLLBACK_TOLERANCE,
  SEMRUSH_SURGICAL_MODE_THRESHOLD,
  SEMRUSH_ULTRA_NEAR_MISS_EXTRA_ROUNDS,
  SEMRUSH_ULTRA_NEAR_MISS_MARGIN,
} from '../constants/seo-score';
import {
  DEFAULT_SITE_SEO_SCORE_CONFIG,
  type ResolvedSiteSeoScoreConfig,
} from '../constants/site-seo-score-settings';

export interface SeoOptimizeHistoryEntry {
  phase: 'local' | 'semrush';
  round: number;
  kind?: 'baseline' | 'optimize';
  rolledBack?: boolean;
}

/** 从 optimizeHistory 尾部统计连续 Semrush 回滚次数（续跑时用于跳过 surgical） */
export function countTrailingSemrushRollbacks(
  history: Array<Pick<SeoOptimizeHistoryEntry, 'phase' | 'kind' | 'rolledBack'>>,
): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry.phase !== 'semrush' || entry.kind === 'baseline') {
      continue;
    }
    if (entry.rolledBack === true) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
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
  config: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
): boolean {
  return (localSeoScore ?? 0) >= config.localPassThreshold || seoCheck.local?.passed === true;
}

/** 续跑 Semrush 时跳过本地优化与进门闸（Semrush 优先下本地分可能已下降） */
export function shouldSkipLocalPipeline(
  localAlreadyPassed: boolean,
  semrushResumable: boolean,
): boolean {
  return localAlreadyPassed || semrushResumable;
}

/** 本地分已过但正文明显短于写作目标时，仍先跑本地扩写，避免把短文直接送入 Semrush 多轮补救。 */
export function shouldForceLocalPipelineForWordGap(input: {
  localAlreadyPassed: boolean;
  semrushResumable: boolean;
  wordCount: number;
  targetWordCount: number;
}): boolean {
  if (!input.localAlreadyPassed || input.semrushResumable) return false;
  if (input.targetWordCount <= 0 || input.wordCount <= 0) return false;

  const gap = input.targetWordCount - input.wordCount;
  const minAcceptableWords = Math.floor(input.targetWordCount * 0.9);
  return gap >= 120 && input.wordCount < minAcceptableWords;
}

/** Semrush 未达标且有初检基线时可续跑，不重复 RPA 初检 */
export function canResumeSemrushOptimization(
  semrushScore: number | null | undefined,
  seoCheck: SeoPersistedCheckData,
  history: SeoOptimizeHistoryEntry[],
  config: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
): boolean {
  if (semrushScore == null || semrushScore >= config.semrushPassThreshold) return false;
  const semrush = seoCheck.semrush;
  if (!semrush || semrush.skipped || semrush.passed === true) return false;
  return hasOptimizeBaseline(history, 'semrush');
}

export function resolveLocalOptimizeRoundCap(
  bestScore: number,
  completedRounds: number,
  isLocalResume: boolean,
  config: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
  options?: { strictCap?: boolean },
): number {
  let cap = config.localMaxOptimizeRounds;
  if (!options?.strictCap) {
    if (bestScore >= config.localPassThreshold - LOCAL_SEO_NEAR_MISS_MARGIN) {
      cap += LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS;
    }
    if (bestScore === config.localPassThreshold - 1) {
      cap += 2;
    }
  }
  if (isLocalResume && completedRounds >= config.localMaxOptimizeRounds) {
    cap = Math.max(cap, completedRounds + config.localRetryExtraRounds);
  }
  return cap;
}

export function resolveSemrushOptimizeRoundCap(
  bestScore: number,
  completedRounds: number,
  isSemrushResume: boolean,
  config: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
  options?: { strictCap?: boolean },
): number {
  let cap = config.semrushMaxOptimizeRounds;
  if (!options?.strictCap) {
    if (bestScore >= config.semrushPassThreshold - SEMRUSH_NEAR_MISS_MARGIN) {
      cap += SEMRUSH_NEAR_MISS_EXTRA_ROUNDS;
    }
    if (bestScore >= config.semrushPassThreshold - SEMRUSH_ULTRA_NEAR_MISS_MARGIN) {
      cap += SEMRUSH_ULTRA_NEAR_MISS_EXTRA_ROUNDS;
    }
  }
  if (isSemrushResume) {
    cap = Math.max(cap, completedRounds + config.semrushRetryExtraRounds);
  }
  return cap;
}

/** Semrush 优化轮：分数提升、达标、RPA 容差、缺词/复杂词/难读句改善时保留 */
export interface SemrushCandidateAcceptInput {
  candidateOverall: number;
  bestOverall: number;
  candidateMissingKeywordCount: number;
  bestMissingKeywordCount: number;
  candidateMissingTargetKeywordCount?: number;
  bestMissingTargetKeywordCount?: number;
  readabilityImproved?: boolean;
  candidateComplexWordHits?: number;
  bestComplexWordHits?: number;
  candidateHardSentenceHits?: number;
  bestHardSentenceHits?: number;
}

export type SemrushCandidateAcceptReason =
  | 'semrush_passed'
  | 'target_keyword_regressed'
  | 'score_improved'
  | 'within_rpa_tolerance'
  | 'missing_keywords_improved'
  | 'readability_improved'
  | 'surgical_missing_keywords_improved'
  | 'surgical_complex_words_improved'
  | 'surgical_hard_sentences_improved'
  | 'score_regressed';

export interface SemrushCandidateAcceptDecision {
  accepted: boolean;
  reason: SemrushCandidateAcceptReason;
}

export function isSemrushSurgicalTier(overall: number): boolean {
  return overall >= SEMRUSH_SURGICAL_MODE_THRESHOLD;
}

export function decideSemrushCandidateAcceptance(
  input: SemrushCandidateAcceptInput,
  config: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
): SemrushCandidateAcceptDecision {
  const targetKeywordRegressed =
    typeof input.candidateMissingTargetKeywordCount === 'number' &&
    typeof input.bestMissingTargetKeywordCount === 'number' &&
    input.candidateMissingTargetKeywordCount > input.bestMissingTargetKeywordCount;

  if (input.candidateOverall >= config.semrushPassThreshold) {
    if (targetKeywordRegressed) {
      return { accepted: false, reason: 'target_keyword_regressed' };
    }
    return { accepted: true, reason: 'semrush_passed' };
  }
  if (input.candidateOverall >= input.bestOverall) {
    return { accepted: true, reason: 'score_improved' };
  }
  if (input.candidateOverall >= input.bestOverall - SEMRUSH_SCORE_ROLLBACK_TOLERANCE) {
    return { accepted: true, reason: 'within_rpa_tolerance' };
  }
  if (
    input.candidateMissingKeywordCount < input.bestMissingKeywordCount &&
    input.candidateOverall >= input.bestOverall - 0.15
  ) {
    return { accepted: true, reason: 'missing_keywords_improved' };
  }
  if (input.readabilityImproved && input.candidateOverall >= input.bestOverall - 0.1) {
    return { accepted: true, reason: 'readability_improved' };
  }
  if (isSemrushSurgicalTier(input.bestOverall)) {
    if (
      input.candidateMissingKeywordCount < input.bestMissingKeywordCount &&
      input.candidateOverall >= input.bestOverall - 0.2
    ) {
      return { accepted: true, reason: 'surgical_missing_keywords_improved' };
    }
    const complexImproved =
      typeof input.candidateComplexWordHits === 'number' &&
      typeof input.bestComplexWordHits === 'number' &&
      input.candidateComplexWordHits < input.bestComplexWordHits;
    if (complexImproved && input.candidateOverall >= input.bestOverall - 0.15) {
      return { accepted: true, reason: 'surgical_complex_words_improved' };
    }
    const hardImproved =
      typeof input.candidateHardSentenceHits === 'number' &&
      typeof input.bestHardSentenceHits === 'number' &&
      input.candidateHardSentenceHits < input.bestHardSentenceHits;
    if (hardImproved && input.candidateOverall >= input.bestOverall - 0.15) {
      return { accepted: true, reason: 'surgical_hard_sentences_improved' };
    }
  }
  return { accepted: false, reason: 'score_regressed' };
}

export function shouldAcceptSemrushCandidate(
  input: SemrushCandidateAcceptInput,
  config: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
): boolean {
  return decideSemrushCandidateAcceptance(input, config).accepted;
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
