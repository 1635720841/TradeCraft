/** 关键词同质化（Cannibalization）检测 */

export const KEYWORD_CANNIBALIZATION_JACCARD_THRESHOLD = 0.6;
export const KEYWORD_CANNIBALIZATION_MIN_SUBSTRING_WORDS = 3;

export type KeywordConflictReason = 'exact' | 'substring' | 'similar';

export interface KeywordConflictCandidate {
  jobId: string;
  keyword: string;
  status: string;
  reason: KeywordConflictReason;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
]);

export function normalizeKeywordPhrase(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(text: string): string[] {
  return normalizeKeywordPhrase(text)
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function detectKeywordConflictReason(
  targetKeyword: string,
  existingKeyword: string,
): KeywordConflictReason | null {
  const target = normalizeKeywordPhrase(targetKeyword);
  const existing = normalizeKeywordPhrase(existingKeyword);
  if (!target || !existing) return null;
  if (target === existing) return 'exact';

  const shorter = target.length <= existing.length ? target : existing;
  const longer = target.length <= existing.length ? existing : target;
  const shorterWords = shorter.split(' ').filter(Boolean);
  if (
    shorterWords.length >= KEYWORD_CANNIBALIZATION_MIN_SUBSTRING_WORDS &&
    longer.includes(shorter)
  ) {
    return 'substring';
  }

  const similarity = jaccardSimilarity(tokenize(target), tokenize(existing));
  if (similarity >= KEYWORD_CANNIBALIZATION_JACCARD_THRESHOLD) return 'similar';

  return null;
}

export function findKeywordConflicts(
  targetKeyword: string,
  candidates: Array<{ jobId: string; keyword: string; status: string }>,
): KeywordConflictCandidate[] {
  const conflicts: KeywordConflictCandidate[] = [];

  for (const candidate of candidates) {
    const reason = detectKeywordConflictReason(targetKeyword, candidate.keyword);
    if (!reason) continue;
    conflicts.push({
      jobId: candidate.jobId,
      keyword: candidate.keyword,
      status: candidate.status,
      reason,
    });
  }

  return conflicts.sort((a, b) => {
    const rank: Record<KeywordConflictReason, number> = {
      exact: 0,
      substring: 1,
      similar: 2,
    };
    return rank[a.reason] - rank[b.reason];
  });
}
