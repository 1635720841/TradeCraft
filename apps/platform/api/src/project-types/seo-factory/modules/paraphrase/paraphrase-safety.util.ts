/**
 * 改写后程序化安全检查（链接/关键词/保护词/结构/规格保留）。
 *
 * 边界：
 * - 不负责：LLM 语义复检（ParaphraseService）
 */

import { normalizeContentLanguage } from '@wm/shared-core';

import { normalizeBrokenMarkdownUrls } from './paraphrase-media.util';

export interface ParaphraseSafetyInput {
  keyword: string;
  originalContent: string;
  paraphrasedContent: string;
  contentLanguage?: string;
  protectedTerms?: string[];
  recommendedKeywords?: string[];
  /** 分块润色非首段时跳过「关键词须在前 200 字符」检查 */
  skipKeywordHeadCheck?: boolean;
  /** 篇幅比例下限（默认 0.85） */
  lengthRatioMin?: number;
  /** 篇幅比例上限（默认 1.15） */
  lengthRatioMax?: number;
}

export interface ParaphraseSafetyResult {
  passed: boolean;
  issues: string[];
}

const SPEC_PATTERN =
  /\d+(?:\.\d+)?\s*(?:mm|cm|m|kg|g|lb|lbs|bar|psi|kPa|MPa|V|A|W|kW|Hz|°C|℃|%|inch|in|ft)\b/gi;

function extractMarkdownLinkUrls(content: string): string[] {
  const urls: string[] = [];
  const normalized = normalizeBrokenMarkdownUrls(content);
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  let match = pattern.exec(normalized);
  while (match) {
    urls.push(match[1].trim());
    match = pattern.exec(normalized);
  }
  return urls;
}

function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  const normalized = normalizeBrokenMarkdownUrls(content);
  const pattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match = pattern.exec(normalized);
  while (match) {
    urls.push(match[1].trim());
    match = pattern.exec(normalized);
  }
  return urls;
}

function normalizeUrlForCompare(url: string): string {
  return url.replace(/\s+/g, '').trim();
}

function hasNormalizedUrl(urlSet: Set<string>, url: string): boolean {
  return urlSet.has(normalizeUrlForCompare(url));
}

function countHeadings(content: string, level: 2 | 3): number {
  const prefix = '#'.repeat(level);
  return (content.match(new RegExp(`^${prefix} `, 'gm')) ?? []).length;
}

function extractNumericSpecs(content: string): string[] {
  return (content.match(SPEC_PATTERN) ?? []).map((item) => item.replace(/\s+/g, ' ').trim().toLowerCase());
}

function countKeywordOccurrences(content: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'gi');
  return (content.match(pattern) ?? []).length;
}

function measureContentLength(content: string, contentLanguage?: string): number {
  const lang = normalizeContentLanguage(contentLanguage);
  if (lang === 'zh-CN') {
    const cjk = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const latinWords = content.split(/\s+/).filter((item) => /[a-zA-Z0-9]/.test(item)).length;
    return cjk + latinWords;
  }
  return content.split(/\s+/).filter(Boolean).length;
}

function checkProtectedTerms(
  original: string,
  paraphrased: string,
  terms: string[] | undefined,
): string[] {
  if (!terms?.length) return [];

  const issues: string[] = [];
  const lowerOriginal = original.toLowerCase();
  const lowerParaphrased = paraphrased.toLowerCase();

  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    if (lowerOriginal.includes(lower) && !lowerParaphrased.includes(lower)) {
      issues.push(`保护词丢失：${trimmed}`);
    }
  }

  return issues;
}

function checkRecommendedKeywords(
  original: string,
  paraphrased: string,
  keywords: string[] | undefined,
  mainKeyword: string,
): string[] {
  if (!keywords?.length) return [];

  const issues: string[] = [];
  const main = mainKeyword.trim().toLowerCase();
  const lowerOriginal = original.toLowerCase();
  const lowerParaphrased = paraphrased.toLowerCase();

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed || trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    if (lower === main) continue;
    if (lowerOriginal.includes(lower) && !lowerParaphrased.includes(lower)) {
      issues.push(`推荐词丢失：${trimmed}`);
    }
  }

  return issues;
}

export function checkParaphraseSafety(input: ParaphraseSafetyInput): ParaphraseSafetyResult {
  const issues: string[] = [];
  const keyword = input.keyword.trim();
  const original = input.originalContent;
  const paraphrased = input.paraphrasedContent;

  if (!paraphrased.trim()) {
    return { passed: false, issues: ['改写结果为空'] };
  }

  const originalUrls = extractMarkdownLinkUrls(original);
  const paraphrasedUrlSet = new Set(extractMarkdownLinkUrls(paraphrased).map(normalizeUrlForCompare));
  for (const url of originalUrls) {
    if (!hasNormalizedUrl(paraphrasedUrlSet, url)) {
      issues.push(`内链 URL 丢失：${url}`);
    }
  }

  const originalImages = extractImageUrls(original);
  const paraphrasedImageSet = new Set(extractImageUrls(paraphrased).map(normalizeUrlForCompare));
  for (const url of originalImages) {
    if (!hasNormalizedUrl(paraphrasedImageSet, url)) {
      issues.push(`配图 URL 丢失：${url}`);
    }
  }

  if (countHeadings(original, 2) !== countHeadings(paraphrased, 2)) {
    issues.push('H2 标题数量发生变化');
  }
  if (countHeadings(original, 3) !== countHeadings(paraphrased, 3)) {
    issues.push('H3 标题数量发生变化');
  }

  const originalSpecs = extractNumericSpecs(original);
  const paraphrasedSpecs = new Set(extractNumericSpecs(paraphrased));
  for (const spec of originalSpecs) {
    if (!paraphrasedSpecs.has(spec)) {
      issues.push(`技术规格丢失：${spec}`);
    }
  }

  issues.push(...checkProtectedTerms(original, paraphrased, input.protectedTerms));
  issues.push(...checkRecommendedKeywords(original, paraphrased, input.recommendedKeywords, keyword));

  if (keyword) {
    const originalCount = countKeywordOccurrences(original, keyword);
    const paraphrasedCount = countKeywordOccurrences(paraphrased, keyword);

    if (paraphrasedCount === 0) {
      issues.push('目标关键词在改写稿中完全缺失');
    } else if (originalCount > 0 && paraphrasedCount < Math.max(1, Math.floor(originalCount * 0.5))) {
      issues.push('目标关键词出现次数显著下降');
    }

    const head = paraphrased.slice(0, 200).toLowerCase();
    if (!input.skipKeywordHeadCheck && !head.includes(keyword.toLowerCase())) {
      issues.push('目标关键词未出现在正文前 200 字符内');
    }
  }

  const originalLen = measureContentLength(original, input.contentLanguage);
  const paraphrasedLen = measureContentLength(paraphrased, input.contentLanguage);
  const lengthRatioMin = input.lengthRatioMin ?? 0.85;
  const lengthRatioMax = input.lengthRatioMax ?? 1.15;
  if (originalLen > 0) {
    const ratio = paraphrasedLen / originalLen;
    if (ratio < lengthRatioMin || ratio > lengthRatioMax) {
      issues.push(`篇幅变化过大（${Math.round(ratio * 100)}%）`);
    }
  }

  return { passed: issues.length === 0, issues };
}
