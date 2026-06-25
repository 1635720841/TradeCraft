/**
 * Semrush SWA SEO 关键词覆盖：正文 vs 目标词/推荐词，对齐侧栏绿/灰 Tag 逻辑。
 */

import type { SeoScore, SemrushActionableIssue } from '@wm/provider-interfaces';
import {
  buildKeywordCoverageManifest,
  findMissingSemrushKeywords,
  isSemrushKeywordPresentInContent,
  manifestToCoverageSnapshot,
  prioritizeMissingKeywords,
  stripMarkdownForKeywordMatch,
  type SeoKeywordCoverageManifest,
} from '@wm/shared-core';
import { isSemrushSpecificKeyword, isWeakExtractedPhrase } from './semrush-keywords.util';
import { dedupeActionableIssues } from './semrush-actionable.util';
import {
  parseSemrushKeywordEntries,
  isSemrushRecommendationsPayload,
  type SemrushRecommendationsPayload,
} from './semrush-recommendations.parser';

export { findMissingSemrushKeywords, isSemrushKeywordPresentInContent, stripMarkdownForKeywordMatch };

/** 9.5+ SWA 高分文章的关键词融合范式（供 LLM Prompt 引用） */
export const HIGH_SCORE_KEYWORD_WEAVING_EXEMPLARS = [
  '长尾问句作 H2：how can i get rid of blisters → ## How Can I Get Rid of Blisters on Feet?',
  '长尾问句作 H2：cure for blistered feet → ## Is There a Cure for Blistered Feet?',
  '症状口语化：teeth crunching → "hearing teeth crunching at night"',
  '患者感受：biting on teeth → "describe the feeling as biting on teeth"',
  '段内设问：what is grinding of teeth → "What is grinding of teeth? It is repeated rubbing..."',
  '实体词作 H2：blood blister → ## What Does a Blood Blister Look Like?',
] as const;

/** 语境化融合指令：引导 LLM 自然写入缺失 SEO 短语 */
export function buildContextualKeywordWeavingInstruction(missingKeywords: string[]): string {
  if (missingKeywords.length === 0) return '';

  const preview = missingKeywords.join(', ');
  const exemplarBlock = HIGH_SCORE_KEYWORD_WEAVING_EXEMPLARS.map((line) => `- ${line}`).join('\n');

  return [
    `[SEO·语境融合·必做] 文章缺失核心 SEO 短语：${preview}。`,
    '请不要将它们罗列为枯燥的列表或生硬的句子（禁止 "For procurement teams, relevant search terms include..."）。',
    '请采用以下自然方式之一将它们融入正文（每个短语仅需融合 1 次）：',
    '1) 将长尾词作为 H2/H3 问句标题（优先用于 ≥4 词的问句型短语）；',
    '2) 将口语化词汇作为患者主观感受或常见症状写进描述段落；',
    '3) 作为段内自然设问或定义句出现。',
    '',
    '9.5+ 高分样例（Foot Skin Blisters 9.6 / Magnesium Teeth Grinding 9.5）：',
    exemplarBlock,
  ].join('\n');
}

/** 严格子串匹配：侧栏灰 Tag「未写入」检测（比 SWA 模糊匹配更严） */
export function isSemrushKeywordStrictlyPresent(content: string, phrase: string): boolean {
  const normalizedContent = content
    .toLowerCase()
    .replace(/[`*_#>\[\](){}|]/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedPhrase = phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedPhrase) return true;
  return normalizedContent.includes(normalizedPhrase);
}

export function collectKeywordTermsFromActionableIssues(
  issues?: SemrushActionableIssue[],
): string[] {
  const terms: string[] = [];
  for (const issue of issues ?? []) {
    if (issue.rule === 'keyword' && issue.terms?.length) {
      terms.push(...issue.terms);
    }
  }
  return terms;
}

const EXTRACTED_FRAGMENT_PREFIX_RE = /^(it|he|she|they|this|that|we|you|as|yet|so)\s+/i;

/** 侧栏推荐词候选：过滤正文提取碎片，要求 ≥2 词或复合词 */
function isEligibleRecommendedPhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || trimmed.length < 3) return false;
  if (EXTRACTED_FRAGMENT_PREFIX_RE.test(trimmed)) return false;
  return isSemrushSpecificKeyword(trimmed, false);
}

/** SWA manifest 已判定缺失项：允许单词推荐（如 known / properly / countless） */
function isEligibleManifestMissingPhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || trimmed.length < 3) return false;
  if (EXTRACTED_FRAGMENT_PREFIX_RE.test(trimmed)) return false;
  return true;
}

/**
 * 收集本轮须融入的全部缺失 SWA 推荐词（无批次上限）。
 * 合并 manifest、模糊匹配缺失、严格子串缺失与 actionable issues。
 */
export function resolveAllSemrushMissingKeywordsForRound(input: {
  content: string;
  semrushResult: SeoScore;
  manifest?: SeoKeywordCoverageManifest | null;
  submittedKeywords?: string[];
}): string[] {
  const { content, semrushResult, manifest, submittedKeywords } = input;

  const recommendedPhrases = mergeSemrushKeywordLists(
    semrushResult.semrushRecommendedKeywords,
    semrushResult.keywordCoverage?.recommended.map((item) => item.phrase),
    semrushResult.semrushMissingRecommendedKeywords,
    collectKeywordTermsFromActionableIssues(semrushResult.actionableIssues),
  );

  const matcherMissing = recommendedPhrases.filter(
    (phrase) =>
      isEligibleRecommendedPhrase(phrase) &&
      !isSemrushKeywordPresentInContent(content, phrase),
  );

  const strictMissing = recommendedPhrases.filter(
    (phrase) =>
      isEligibleRecommendedPhrase(phrase) &&
      !isSemrushKeywordStrictlyPresent(content, phrase),
  );

  const manifestMissing =
    manifest && manifest.missing.length > 0
      ? manifest.missing.filter(isEligibleManifestMissingPhrase)
      : [];

  const submittedStrictMissing = (submittedKeywords ?? []).filter(
    (phrase) =>
      !isWeakExtractedPhrase(phrase) &&
      (isEligibleManifestMissingPhrase(phrase) || isSemrushSpecificKeyword(phrase, false)) &&
      !isSemrushKeywordStrictlyPresent(content, phrase),
  );

  return mergeSemrushKeywordLists(
    prioritizeMissingKeywords(manifestMissing, manifest?.recommended ?? []),
    submittedStrictMissing,
    matcherMissing,
    strictMissing,
  );
}

export function mergeSemrushKeywordLists(...lists: Array<string[] | undefined>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const item of list ?? []) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }
  }

  return merged;
}

export function buildSemrushKeywordActionableIssues(
  missingTarget: string[],
  missingRecommended: string[],
): SemrushActionableIssue[] {
  const issues: SemrushActionableIssue[] = [];

  if (missingTarget.length > 0) {
    issues.push({
      category: 'seo',
      rule: 'keyword',
      label: '目标关键词未覆盖',
      terms: missingTarget,
    });
  }

  if (missingRecommended.length > 0) {
    issues.push({
      category: 'seo',
      rule: 'keyword',
      label: '推荐关键词未覆盖',
      terms: missingRecommended,
    });
  }

  return issues;
}

export interface SemrushKeywordCoverageOptions {
  /** 创建任务时提交给 SWA 的主词/副词 */
  submittedKeywords?: string[];
  /** DOM SEO Tab 解析的未覆盖 Tag（合并进 API recommended_keywords） */
  domUncoveredKeywords?: string[];
  /** Semrush recommendations API 原始 JSON（真源） */
  apiPayload?: SemrushRecommendationsPayload;
}

function buildRecommendedPhrasesFromApi(
  apiPayload: SemrushRecommendationsPayload,
  domUncoveredKeywords?: string[],
) {
  const { recommended } = parseSemrushKeywordEntries(apiPayload);
  const phrases = recommended.map((entry) => ({
    phrase: entry.keyword,
    frequency: entry.frequency,
    difficulty: entry.difficulty,
  }));
  const seen = new Set(phrases.map((item) => item.phrase.toLowerCase()));
  for (const term of domUncoveredKeywords ?? []) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push({ phrase: trimmed, frequency: undefined, difficulty: undefined });
  }
  return phrases;
}

function mergeRecommendedPhrasesForCoverage(
  result: SeoScore,
  options?: SemrushKeywordCoverageOptions,
): Array<{ phrase: string; frequency?: string; difficulty?: number }> {
  const merged = new Map<string, { phrase: string; frequency?: string; difficulty?: number }>();
  const push = (entry: { phrase: string; frequency?: string; difficulty?: number }) => {
    const phrase = entry.phrase.trim();
    if (!phrase) return;
    const key = phrase.toLowerCase();
    if (merged.has(key)) return;
    merged.set(key, { ...entry, phrase });
  };

  if (options?.apiPayload) {
    for (const entry of buildRecommendedPhrasesFromApi(
      options.apiPayload,
      options.domUncoveredKeywords,
    )) {
      push(entry);
    }
  } else {
    for (const phrase of mergeSemrushKeywordLists(
      result.semrushRecommendedKeywords,
      result.keywordCoverage?.recommended.map((item) => item.phrase),
      result.semrushMissingRecommendedKeywords,
      options?.domUncoveredKeywords,
    )) {
      push({ phrase });
    }
  }

  // SWA 侧栏提交词表始终纳入覆盖检测（API 未返回时也能发现缺口）
  for (const raw of options?.submittedKeywords ?? []) {
    const phrase = raw.trim();
    if (!phrase || isWeakExtractedPhrase(phrase)) continue;
    if (!isEligibleManifestMissingPhrase(phrase) && !isSemrushSpecificKeyword(phrase, false)) {
      continue;
    }
    push({ phrase });
  }

  return [...merged.values()];
}

/** 合并 API 词表 + 正文缺失检测 + 统一 keywordCoverage 快照 */
export function enrichSemrushKeywordCoverage(
  result: SeoScore,
  content: string,
  options?: SemrushKeywordCoverageOptions,
): SeoScore {
  const targetKeywords = mergeSemrushKeywordLists(
    options?.submittedKeywords,
    result.semrushTargetKeywords,
  );

  const recommendedPhrases = mergeRecommendedPhrasesForCoverage(result, options);
  const extractedPhrases = options?.apiPayload
    ? parseSemrushKeywordEntries(options.apiPayload).extracted.map((entry) => ({
        phrase: entry.keyword,
        frequency: entry.frequency,
        difficulty: entry.difficulty,
      }))
    : undefined;

  const manifest = buildKeywordCoverageManifest({
    source: 'semrush',
    recommendedPhrases,
    extractedPhrases,
    content,
    isPresent: isSemrushKeywordStrictlyPresent,
  });

  let missingTarget = findMissingSemrushKeywords(content, targetKeywords);
  const missingRecommended = manifest.missing;

  for (const term of options?.domUncoveredKeywords ?? []) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    if (targetKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      if (!missingTarget.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
        missingTarget.push(trimmed);
      }
    }
  }

  missingTarget = [...new Set(missingTarget)];

  const keywordIssues = buildSemrushKeywordActionableIssues(missingTarget, missingRecommended);
  const actionableIssues =
    keywordIssues.length > 0
      ? dedupeActionableIssues([...(result.actionableIssues ?? []), ...keywordIssues])
      : result.actionableIssues;

  const seoLines = [...(result.suggestionDetails?.seo ?? [])];
  if (missingTarget.length > 0) {
    seoLines.push(`目标关键词未覆盖: ${missingTarget.join(', ')}`);
  }
  if (missingRecommended.length > 0) {
    const preview = missingRecommended.slice(0, 12).join(', ');
    const suffix = missingRecommended.length > 12 ? ` 等 ${missingRecommended.length} 个` : '';
    seoLines.push(`推荐关键词未覆盖: ${preview}${suffix}`);
  }

  const suggestionDetails =
    missingTarget.length > 0 || missingRecommended.length > 0
      ? {
          ...result.suggestionDetails,
          seo: [...new Set(seoLines)],
        }
      : result.suggestionDetails;

  const snapshot = manifestToCoverageSnapshot(manifest);

  return {
    ...result,
    semrushTargetKeywords: targetKeywords.length > 0 ? targetKeywords : result.semrushTargetKeywords,
    semrushRecommendedKeywords: manifest.recommended.map((item) => item.phrase),
    semrushMissingTargetKeywords: missingTarget.length > 0 ? missingTarget : undefined,
    semrushMissingRecommendedKeywords:
      missingRecommended.length > 0 ? missingRecommended : undefined,
    keywordCoverage: snapshot,
    actionableIssues,
    suggestionDetails,
  };
}

/**
 * 收集正文中已命中的 SEO 短语（供可读性优化轮「关键词保护锁」使用）。
 */
export function collectPresentSeoPhrases(content: string, phrases: string[]): string[] {
  const present: string[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isSemrushKeywordPresentInContent(content, trimmed)) {
      present.push(trimmed);
    }
  }

  return present;
}

export function pickSemrushRecommendationsApiPayload(
  captured: Array<{ url: string; body: unknown }>,
): SemrushRecommendationsPayload | undefined {
  let bestReady: SemrushRecommendationsPayload | undefined;
  let bestReadyCount = -1;
  let fallback: SemrushRecommendationsPayload | undefined;
  let fallbackCount = -1;

  for (const { url, body } of captured) {
    if (!isSemrushRecommendationsPayload(body)) continue;
    if (!/\/recommendations\//i.test(url)) continue;

    const payload = body as SemrushRecommendationsPayload;
    const recCount = payload.recommended_keywords?.length ?? 0;
    const ready = payload.data_ready === true;

    if (ready) {
      if (recCount > bestReadyCount) {
        bestReadyCount = recCount;
        bestReady = payload;
      }
      continue;
    }

    if (recCount > fallbackCount) {
      fallbackCount = recCount;
      fallback = payload;
    }
  }

  return bestReady ?? fallback;
}
