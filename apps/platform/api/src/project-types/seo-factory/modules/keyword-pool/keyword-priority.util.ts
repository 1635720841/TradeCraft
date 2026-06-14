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
  const searchVolumeScore = normalizeSearchVolumeScore(input.searchVolume);
  const keywordDifficultyScore = normalizeDifficultyScore(input.keywordDifficulty);
  const businessValueScore = clamp01(input.businessValueScore ?? 0.5);
  const contentFitScore = clamp01(input.contentFitScore ?? 0.5);

  const raw =
    searchVolumeScore * 0.25 +
    businessValueScore * 0.35 +
    keywordDifficultyScore * 0.2 +
    contentFitScore * 0.2;

  return Math.round(raw * 1000) / 10;
}
