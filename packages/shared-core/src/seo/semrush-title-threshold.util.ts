export interface SemrushTitleThresholdResult {
  title: string;
  charCount: number;
  wordCount: number;
  preferredCharMin: number;
  preferredCharMax: number;
  preferredWordMin: number;
  preferredWordMax: number;
  hardCharMax: number;
  hardWordMax: number;
  inPreferredBand: boolean;
  exceedsHardLimit: boolean;
  hint: string;
}

function countWordsEn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Semrush-friendly H1 length heuristic.
 *
 * This is intentionally simple and deterministic so both backend prompts and UI can share it.
 */
export function analyzeSemrushTitleThreshold(title: string): SemrushTitleThresholdResult {
  const normalized = (title ?? '').replace(/\s+/g, ' ').trim();
  const charCount = normalized.length;
  const wordCount = normalized ? countWordsEn(normalized) : 0;

  const preferredCharMin = 45;
  const preferredCharMax = 60;
  const preferredWordMin = 8;
  const preferredWordMax = 11;
  const hardCharMax = 60;
  const hardWordMax = 12;

  const inPreferredBand =
    charCount >= preferredCharMin &&
    charCount <= preferredCharMax &&
    wordCount >= preferredWordMin &&
    wordCount <= preferredWordMax;

  const exceedsHardLimit = charCount > hardCharMax || wordCount > hardWordMax;

  const hint = exceedsHardLimit
    ? `标题偏长（${charCount} 字符 / ${wordCount} 词），建议收敛到 45–60 字符、8–11 词；超过 60 字符或 12 词可能扣分。`
    : inPreferredBand
      ? `标题处于推荐区间（${charCount} 字符 / ${wordCount} 词），优先保持自然表达，不要继续堆关键词片段。`
      : `标题当前为 ${charCount} 字符 / ${wordCount} 词；推荐目标 45–60 字符、8–11 词（达标后优先自然表达）。`;

  return {
    title: normalized,
    charCount,
    wordCount,
    preferredCharMin,
    preferredCharMax,
    preferredWordMin,
    preferredWordMax,
    hardCharMax,
    hardWordMax,
    inPreferredBand,
    exceedsHardLimit,
    hint,
  };
}

