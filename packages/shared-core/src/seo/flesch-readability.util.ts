/**
 * Flesch Reading Ease（与 Semrush SWA 可读性指数同量纲 0–100）。
 *
 * 公式（英文）：
 * Score = 206.835 − 1.015×(words/sentences) − 84.6×(syllables/words)
 *
 * Semrush B2B 常见目标约 50（10–12 年级，「相当困难」区间）。
 */

/** Semrush SWA 默认可读性目标（竞品均值，B2B 常见 48–52） */
export const SEMRUSH_FLESCH_TARGET_DEFAULT = 50;

/** 与目标分差在此范围内视为对齐（不扣分） */
export const SEMRUSH_FLESCH_TOLERANCE = 8;

export function stripContentForFlesch(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#+\s+/gm, ' ')
    .replace(/^[-*]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 英文音节启发式（与常见 Flesch 实现一致） */
export function countSyllablesInWord(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;

  let w = cleaned
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const matches = w.match(/[aeiouy]{1,2}/g);
  return matches && matches.length > 0 ? matches.length : 1;
}

export function calculateFleschReadingEase(content: string): number {
  const text = stripContentForFlesch(content);
  if (!text) return 0;

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (sentences.length === 0 || words.length === 0) return 0;

  const syllables = words.reduce((sum, word) => sum + countSyllablesInWord(word), 0);
  const score =
    206.835 -
    1.015 * (words.length / sentences.length) -
    84.6 * (syllables / words.length);

  return Math.round(score * 10) / 10;
}

export function fleschDeltaFromTarget(score: number, target: number): number {
  return Math.abs(score - target);
}

export function isFleschAlignedWithSemrush(
  score: number,
  target: number = SEMRUSH_FLESCH_TARGET_DEFAULT,
  tolerance: number = SEMRUSH_FLESCH_TOLERANCE,
): boolean {
  return fleschDeltaFromTarget(score, target) <= tolerance;
}

/** Flesch 向 Semrush 目标靠近至少 minDelta 分 */
export function isFleschProgressTowardTarget(input: {
  before: number;
  after: number;
  target?: number;
  minDelta?: number;
}): boolean {
  const target = input.target ?? SEMRUSH_FLESCH_TARGET_DEFAULT;
  const minDelta = input.minDelta ?? 1;
  const beforeGap = fleschDeltaFromTarget(input.before, target);
  const afterGap = fleschDeltaFromTarget(input.after, target);
  return afterGap + minDelta <= beforeGap;
}
