/**
 * Semrush SWA 固定标题规则：至少一个目标关键词；每个目标关键词在标题中最多出现一次。
 */

import { isSemrushKeywordPresentInContent } from './semrush-keyword-match.util';

/** Semrush 侧栏原文（固定规则，非按稿变化） */
export const SEMRUSH_TITLE_TARGET_KEYWORD_RULE_ZH =
  '在标题中至少使用一个目标关键词，每个目标关键词的使用次数请勿超过一次。';

export const SEMRUSH_TITLE_TARGET_KEYWORD_RULE_EN =
  'Use at least one target keyword in the title; each target keyword may appear at most once in the title.';

export type SemrushTitleKeywordIssueCode =
  | 'no_target_keyword_in_title'
  | 'target_keyword_repeated_in_title';

export interface SemrushTitleKeywordIssue {
  code: SemrushTitleKeywordIssueCode;
  keyword?: string;
  count?: number;
  message: string;
}

function countExactPhrase(text: string, phrase: string): number {
  const lower = text.toLowerCase();
  const target = phrase.toLowerCase().trim();
  if (!target) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(target, pos)) !== -1) {
    count += 1;
    pos += target.length;
  }
  return count;
}

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'were',
  'how', 'can', 'what', 'when', 'where', 'why', 'who', 'does', 'into', 'about', 'have', 'has',
]);

function tokenizeTitle(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !TITLE_STOPWORDS.has(word));
}

function normalizeTitleToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === 'feet') return 'foot';
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('ing') && lower.length > 5) return lower.slice(0, -3);
  if (lower.endsWith('ed') && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

function headingMatchesKeyword(title: string, keyword: string): boolean {
  const headingTokens = new Set(tokenizeTitle(title).map(normalizeTitleToken));
  const keywordTokens = [...new Set(tokenizeTitle(keyword).map(normalizeTitleToken))];
  if (keywordTokens.length === 0) return false;
  const matched = keywordTokens.filter((token) => headingTokens.has(token)).length;
  const required =
    keywordTokens.length >= 3 ? Math.ceil(keywordTokens.length * 0.6) : keywordTokens.length;
  return matched >= required;
}

function titleContainsTargetKeyword(title: string, keyword: string): boolean {
  if (isSemrushKeywordPresentInContent(title, keyword)) return true;
  if (headingMatchesKeyword(title, keyword)) return true;
  const keywordWordCount = keyword.trim().split(/\s+/).filter(Boolean).length;
  if (keywordWordCount < 4) return false;
  const keywordTokens = tokenizeTitle(keyword).map(normalizeTitleToken);
  const headingTokens = new Set(tokenizeTitle(title).map(normalizeTitleToken));
  return keywordTokens.some((token) => headingTokens.has(token));
}

function dedupeKeywords(keywords: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

/** 统计目标短语在标题中的出现次数（精确子串；无精确匹配时不记重复） */
export function countTargetKeywordInTitle(title: string, keyword: string): number {
  const trimmed = title.trim();
  if (!trimmed) return 0;
  return countExactPhrase(trimmed, keyword);
}

/**
 * 校验 Semrush 固定标题关键词规则。
 * `targetKeywords` 为空时跳过（无 SWA 目标词配置）。
 */
export function analyzeSemrushTitleTargetKeywordIssues(
  title: string,
  targetKeywords: string[],
): SemrushTitleKeywordIssue[] {
  const keywords = dedupeKeywords(targetKeywords);
  if (keywords.length === 0) return [];

  const trimmed = title.trim();
  if (!trimmed || trimmed === '(untitled)') {
    return [
      {
        code: 'no_target_keyword_in_title',
        message: `标题须至少包含一个目标关键词（${keywords.join('、')}）`,
      },
    ];
  }

  const present = keywords.filter((keyword) => titleContainsTargetKeyword(trimmed, keyword));

  const issues: SemrushTitleKeywordIssue[] = [];
  if (present.length === 0) {
    issues.push({
      code: 'no_target_keyword_in_title',
      message: `标题须至少包含一个目标关键词（${keywords.join('、')}）`,
    });
  }

  for (const keyword of keywords) {
    const count = countTargetKeywordInTitle(trimmed, keyword);
    if (count > 1) {
      issues.push({
        code: 'target_keyword_repeated_in_title',
        keyword,
        count,
        message: `标题中「${keyword}」出现 ${count} 次；${SEMRUSH_TITLE_TARGET_KEYWORD_RULE_ZH}`,
      });
    }
  }

  return issues;
}

export function semrushTitleTargetKeywordRulePasses(
  title: string,
  targetKeywords: string[],
): boolean {
  return analyzeSemrushTitleTargetKeywordIssues(title, targetKeywords).length === 0;
}
