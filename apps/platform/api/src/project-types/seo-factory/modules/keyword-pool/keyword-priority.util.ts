/**
 * 关键词优先级评分纯函数（对齐 PRD 6.2 权重）。
 *
 * 边界：
 * - 不负责：持久化（KeywordPoolService）
 */

export interface KeywordPriorityInput {
  searchVolume?: number | null;
  keywordDifficulty?: number | null;
  businessValueScore?: number | null;
  contentFitScore?: number | null;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 搜索量 0–100k 对数归一化；缺失时 0.5 */
export function normalizeSearchVolumeScore(searchVolume?: number | null): number {
  if (searchVolume == null || searchVolume <= 0) return 0.5;
  const capped = Math.min(searchVolume, 100_000);
  return clamp01(Math.log10(capped + 1) / Math.log10(100_001));
}

/** KD 越低分越高；缺失时 0.5 */
export function normalizeDifficultyScore(keywordDifficulty?: number | null): number {
  if (keywordDifficulty == null) return 0.5;
  const kd = Math.min(100, Math.max(0, keywordDifficulty));
  return clamp01((100 - kd) / 100);
}

export function computeKeywordPriorityScore(input: KeywordPriorityInput): number {
  const businessValueScore = clamp01(input.businessValueScore ?? 0.5);
  const contentFitScore = clamp01(input.contentFitScore ?? 0.5);

  // 搜索指标 API 未接入前，仅按商业价值与内容匹配计分；接入后可恢复 searchVolume/KD 权重。
  const raw = businessValueScore * 0.5 + contentFitScore * 0.5;

  return Math.round(raw * 1000) / 10;
}

/** 与前端 keyword-display 高优先级阈值一致（0–100 分制） */
export const KEYWORD_HIGH_PRIORITY_THRESHOLD = 75;
