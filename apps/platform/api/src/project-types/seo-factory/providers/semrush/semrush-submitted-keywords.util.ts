/**
 * Semrush SWA 提交词表：从正文提取已覆盖短语（8–12 个），对齐「从文本中提取」高分路径。
 *
 * 边界：
 * - 不负责：RPA 填表（SemrushRpaAdapter）
 * - 不负责：LLM 写作用词（仍用 brief/SERP 推荐词）
 *
 * 入口：
 * - buildSemrushSubmittedKeywords
 */

import {
  SEMRUSH_SUBMITTED_KEYWORD_MAX,
  SEMRUSH_SUBMITTED_KEYWORD_MIN,
} from '../../constants/seo-score';
import {
  flattenSemrushKeywordList,
  isSemrushSpecificKeyword,
  isWeakExtractedPhrase,
  splitSemrushKeywordParts,
} from './semrush-keywords.util';
import {
  isSemrushKeywordPresentInContent,
  stripMarkdownForKeywordMatch,
} from './semrush-keyword-coverage.util';

export interface BuildSemrushSubmittedKeywordsOptions {
  /** 任务主词；仅当正文已覆盖且词表未满时才追加 */
  targetKeyword?: string;
  /** Brief/SERP 候选池；仅 boost 已在正文出现的短语，不强行塞入缺失词 */
  poolKeywords?: string[];
  maxCount?: number;
  minCount?: number;
}

type CandidateSource = 'heading' | 'link' | 'body' | 'pool';

interface ScoredCandidate {
  phrase: string;
  score: number;
  source: CandidateSource;
}

const MAX_CANDIDATE_WORDS = 6;
const MIN_CANDIDATE_WORDS = 2;

function normalizePhrase(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|`]/g, ' ')
    .replace(/[/\\]/g, ' ')
    .replace(/[.,;:!?()[\]{}'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripInlineMarkup(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_~|`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WEAK_EDGE_WORDS = new Set([
  'is',
  'or',
  'the',
  'and',
  'a',
  'an',
  'on',
  'in',
  'with',
  'for',
  'to',
  'of',
  'from',
  'that',
  'this',
  'so',
  'it',
  'if',
  'not',
  'only',
  'by',
  'can',
  'do',
  'does',
  'sees',
  'see',
  'work',
  'age',
  'stop',
]);

function isWeakBodyPhrase(phrase: string): boolean {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  if (WEAK_EDGE_WORDS.has(first) || WEAK_EDGE_WORDS.has(last)) return true;
  if (words.length === 2 && words[0] === 'extends' && words[1] === 'battery') return true;
  if (words.length <= 3 && words.includes('or')) return true;
  if (words.length <= 3 && words.includes('and')) return true;
  return false;
}
function isUsablePhrase(phrase: string, source: CandidateSource = 'body'): boolean {
  const normalized = normalizePhrase(phrase);
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < MIN_CANDIDATE_WORDS || words.length > MAX_CANDIDATE_WORDS) {
    return false;
  }
  if (/^[\d\s./,-]+$/.test(normalized)) return false;
  if (/^image:/i.test(normalized)) return false;
  if (
    words.length < 4 &&
    /^(what|is|a|an|the|and|or|in|on|for|to|of|that|this|with)$/i.test(words[0] ?? '')
  ) {
    return false;
  }
  if (source === 'body' && isWeakBodyPhrase(normalized)) return false;
  if (isWeakExtractedPhrase(normalized)) return false;
  return isSemrushSpecificKeyword(normalized, false);
}

function pushCandidate(
  bucket: Map<string, ScoredCandidate>,
  raw: string,
  source: CandidateSource,
  score: number,
): void {
  const phrase = normalizePhrase(raw);
  if (!isUsablePhrase(phrase, source)) return;

  const existing = bucket.get(phrase);
  if (!existing || score > existing.score) {
    bucket.set(phrase, { phrase, score, source });
  } else if (existing && score === existing.score && source === 'heading') {
    bucket.set(phrase, { phrase, score, source: 'heading' });
  }
}

function extractHeadingPhrases(content: string): string[] {
  const phrases: string[] = [];
  for (const match of content.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    phrases.push(stripInlineMarkup(match[1] ?? ''));
  }
  for (const match of content.matchAll(/^#{1,3}\s+(.+)$/gm)) {
    phrases.push(stripInlineMarkup(match[1] ?? ''));
  }
  return phrases.filter(Boolean);
}

function extractLinkAnchorPhrases(content: string): string[] {
  const phrases: string[] = [];
  for (const match of content.matchAll(/\[[^\]]+]\([^)]+\)/g)) {
    const anchor = match[0].match(/^\[([^\]]+)]/);
    if (anchor?.[1]) phrases.push(stripInlineMarkup(anchor[1]));
  }
  for (const match of content.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    phrases.push(stripInlineMarkup(match[1] ?? ''));
  }
  return phrases.filter(Boolean);
}

function extractBodyNGramPhrases(content: string): string[] {
  const haystack = stripMarkdownForKeywordMatch(content);
  const words = haystack.split(/\s+/).filter((word) => word.length >= 2);
  const phrases: string[] = [];

  for (let size = MIN_CANDIDATE_WORDS; size <= 4; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      phrases.push(words.slice(index, index + size).join(' '));
    }
  }

  return phrases;
}

function scoreCandidate(
  phrase: string,
  source: CandidateSource,
  poolSet: Set<string>,
): number {
  const words = phrase.split(/\s+/).filter(Boolean);
  let score = words.length;

  if (source === 'heading') score += 15;
  if (source === 'link') score += 12;
  if (source === 'pool') score += 6;
  if (poolSet.has(phrase)) score += 8;
  if (words.length === 2 || words.length === 3) score += 6;
  if (words.length === 4) score += 2;
  if (words.length >= 5) score -= 10;
  if (/[/\\]/.test(phrase)) score -= 6;

  return score;
}

function pushHeadingNGrams(
  bucket: Map<string, ScoredCandidate>,
  heading: string,
  poolSet: Set<string>,
): void {
  const normalized = normalizePhrase(heading);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < MIN_CANDIDATE_WORDS) return;

  if (words.length <= 5) {
    const phrase = words.join(' ');
    pushCandidate(bucket, phrase, 'heading', scoreCandidate(phrase, 'heading', poolSet));
    return;
  }

  // 长标题不滑窗，避免「what is a」「bms guide for」等碎片
}

function pruneSubstringPhrases(phrases: string[]): string[] {
  return phrases.filter((phrase, index) =>
    !phrases.some((other, otherIndex) => {
      if (index === otherIndex || other.length <= phrase.length) return false;
      return ` ${other} `.includes(` ${phrase} `);
    }),
  );
}

function isRedundantKeywordPhrase(candidate: string, selected: string[]): boolean {
  return selected.some((picked) => {
    if (picked === candidate) return true;
    return (
      (picked.length < candidate.length && ` ${candidate} `.includes(` ${picked} `)) ||
      (picked.length > candidate.length && ` ${picked} `.includes(` ${candidate} `))
    );
  });
}

function collectScoredCandidates(
  content: string,
  poolKeywords: string[],
): ScoredCandidate[] {
  const bucket = new Map<string, ScoredCandidate>();
  const poolSet = new Set(poolKeywords.map((item) => normalizePhrase(item)).filter(Boolean));

  for (const heading of extractHeadingPhrases(content)) {
    pushHeadingNGrams(bucket, heading, poolSet);
  }

  for (const anchor of extractLinkAnchorPhrases(content)) {
    pushCandidate(bucket, anchor, 'link', scoreCandidate(normalizePhrase(anchor), 'link', poolSet));
  }

  for (const phrase of extractBodyNGramPhrases(content)) {
    pushCandidate(bucket, phrase, 'body', scoreCandidate(phrase, 'body', poolSet));
  }

  return [...bucket.values()]
    .filter((item) => isSemrushKeywordPresentInContent(content, item.phrase))
    .sort((a, b) => b.score - a.score || a.phrase.length - b.phrase.length);
}

/**
 * 从正文提取 SWA 提交词表：只含正文已覆盖的 8–12 个短语（对齐 Semrush「从文本中提取」）。
 */
export function buildSemrushSubmittedKeywords(
  content: string,
  options: BuildSemrushSubmittedKeywordsOptions = {},
): string[] {
  const maxCount = options.maxCount ?? SEMRUSH_SUBMITTED_KEYWORD_MAX;
  const minCount = options.minCount ?? SEMRUSH_SUBMITTED_KEYWORD_MIN;
  const poolKeywords = options.poolKeywords ?? [];
  const ranked = collectScoredCandidates(content, poolKeywords);

  const selected: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (phrase: string): void => {
    const normalized = normalizePhrase(phrase);
    if (!normalized || seen.has(normalized)) return;
    if (!isSemrushKeywordPresentInContent(content, normalized)) return;
    if (isRedundantKeywordPhrase(normalized, selected)) return;
    seen.add(normalized);
    selected.push(normalized);
  };

  let headingSlots = 0;
  for (const heading of extractHeadingPhrases(content)) {
    if (selected.length >= maxCount || headingSlots >= 2) break;
    const normalized = normalizePhrase(heading);
    if (!isUsablePhrase(normalized, 'heading')) continue;
    const before = selected.length;
    pushUnique(heading);
    if (selected.length > before) headingSlots += 1;
  }
  let linkSlots = 0;
  for (const anchor of extractLinkAnchorPhrases(content)) {
    if (selected.length >= maxCount || linkSlots >= 2) break;
    const normalized = normalizePhrase(anchor);
    if (!isUsablePhrase(normalized, 'link')) continue;
    const before = selected.length;
    pushUnique(anchor);
    if (selected.length > before) linkSlots += 1;
  }

  for (const item of ranked) {
    if (selected.length >= maxCount) break;
    pushUnique(item.phrase);
  }

  if (selected.length < minCount) {
    for (const poolPhrase of poolKeywords) {
      if (selected.length >= maxCount) break;
      const normalized = normalizePhrase(poolPhrase);
      if (!normalized || normalized.split(/\s+/).length < 3) continue;
      pushUnique(poolPhrase);
    }
  }

  const targetKeyword = options.targetKeyword?.trim();
  let result = pruneSubstringPhrases(selected)
    .filter((phrase) => !isWeakExtractedPhrase(phrase))
    .slice(0, maxCount);

  if (targetKeyword) {
    const prepended: string[] = [];
    for (const part of splitSemrushKeywordParts(targetKeyword)) {
      if (!isSemrushKeywordPresentInContent(content, part)) continue;
      const normalizedTarget = normalizePhrase(part);
      if (
        prepended.some((phrase) => phrase === normalizedTarget) ||
        result.some((phrase) => phrase.toLowerCase() === normalizedTarget)
      ) {
        continue;
      }
      prepended.push(normalizedTarget);
    }
    if (prepended.length > 0) {
      const pinned = new Set(prepended);
      result = [...prepended, ...result.filter((phrase) => !pinned.has(phrase))].slice(0, maxCount);
    }
  }

  return result;
}

/** 过滤正文 n-gram 噪声，续跑/checkpoint 词表复用时调用 */
export function sanitizeSemrushSubmittedKeywords(keywords: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords) {
    const phrase = raw.trim();
    if (!phrase || isWeakExtractedPhrase(phrase)) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
  }
  return result;
}

/** 只保留正文已出现的提交词（SWA 目标关键词须能在稿内匹配） */
export function filterSemrushSubmittedKeywordsInContent(
  content: string,
  keywords: string[],
): string[] {
  return sanitizeSemrushSubmittedKeywords(
    keywords.filter((phrase) => isSemrushKeywordPresentInContent(content, phrase)),
  );
}

/** 构造 Semrush RPA 入参：优先使用提取词表 */
export function buildSemrushCheckInputFromContent(
  content: string,
  targetKeyword: string,
  poolKeywords: string[] = [],
): {
  content: string;
  keyword: string;
  recommendedKeywords: string[];
  submittedKeywords: string[];
} {
  const submittedKeywords = filterSemrushSubmittedKeywordsInContent(
    content,
    sanitizeSemrushSubmittedKeywords(
      buildSemrushSubmittedKeywords(content, {
        targetKeyword,
        poolKeywords,
      }),
    ),
  );
  const primaryParts = targetKeyword.trim()
    ? splitSemrushKeywordParts(targetKeyword)
    : submittedKeywords[0]
      ? [submittedKeywords[0]]
      : [];
  const primary = primaryParts[0] ?? '';
  const coveredPoolKeywords: string[] = [];
  for (const poolPhrase of flattenSemrushKeywordList(poolKeywords)) {
    const normalized = normalizePhrase(poolPhrase);
    if (!normalized || coveredPoolKeywords.includes(normalized)) continue;
    if (!isUsablePhrase(normalized, 'pool')) continue;
    if (!isSemrushKeywordPresentInContent(content, normalized)) continue;
    if (isRedundantKeywordPhrase(normalized, coveredPoolKeywords)) continue;
    coveredPoolKeywords.push(normalized);
  }
  const orderedSubmitted = flattenSemrushKeywordList([
    ...primaryParts,
    ...coveredPoolKeywords,
    ...submittedKeywords,
  ]).slice(0, SEMRUSH_SUBMITTED_KEYWORD_MAX);

  return {
    content,
    keyword: primary,
    recommendedKeywords: orderedSubmitted.slice(1),
    submittedKeywords: orderedSubmitted,
  };
}
