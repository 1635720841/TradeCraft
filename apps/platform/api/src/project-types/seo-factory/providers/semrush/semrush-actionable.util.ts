/**
 * Semrush SWA 侧栏结构化建议：规则分类、合并进 suggestionDetails。
 */

import type {
  SemrushActionableIssue,
  SemrushIssueRule,
  SemrushSuggestionDetails,
} from '@wm/provider-interfaces';

const ENGLISH_SENTENCE_RE = /^[A-Za-z][A-Za-z0-9\s,'"()-]{10,320}[.!?]?$/;

export function classifySemrushIssueRule(label: string): SemrushIssueRule {
  const t = label.trim();
  if (/主动语态|active voice/i.test(t)) return 'passive_voice';
  if (/复杂|complex word/i.test(t)) return 'complex_word';
  if (/随意|casual sentence/i.test(t)) return 'casual_sentence';
  if (/移除或替换|填充|filler/i.test(t)) return 'filler_phrase';
  if (/段落|paragraph|拆分长段/i.test(t)) return 'long_paragraph';
  if (/关键词|keyword/i.test(t)) return 'keyword';
  if (/链接|link/i.test(t)) return 'other';
  if (/图片|image/i.test(t)) return 'other';
  return 'other';
}

export function isEnglishSentenceQuote(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12 || trimmed.length > 360) return false;
  if (/^(重写|考虑|语气|可读性|Rewrite|Consider|Tone|Readability|\d+\.)/i.test(trimmed)) {
    return false;
  }
  return ENGLISH_SENTENCE_RE.test(trimmed);
}

/** 从 SWA 侧栏 innerText 提取编号原句（支持 `1.` 与 `1\\n句子` 两种格式） */
export function extractNumberedQuotesFromSidebarText(
  sidebarText: string,
  headerRe: RegExp,
  maxItems = 24,
): string[] {
  const idx = sidebarText.search(headerRe);
  if (idx < 0) return [];

  const slice = sidebarText.slice(idx, idx + 8_000);
  const quotes: string[] = [];
  const push = (text: string) => {
    const q = text.replace(/\s+/g, ' ').trim();
    if (isEnglishSentenceQuote(q)) quotes.push(q);
  };

  for (const m of slice.matchAll(/\d+\.\s*([A-Za-z][^\n]{8,320}?[.!?])/g)) {
    push(m[1]);
  }
  for (const m of slice.matchAll(/(?:^|\n)\s*\d+\s*\n\s*([A-Za-z][^\n]{8,320}?[.!?])/gm)) {
    push(m[1]);
  }
  const normalized = slice.replace(/\s+/g, ' ');
  for (const m of normalized.matchAll(/\b\d+\s+([A-Za-z][^.!?]{8,280}[.!?])/g)) {
    push(m[1]);
  }

  return [...new Set(quotes)].slice(0, maxItems);
}

const SIDEBAR_HEADER_RULES: Array<{
  re: RegExp;
  rule: SemrushIssueRule;
  category: SemrushActionableIssue['category'];
}> = [
  { re: /最为随意的句子|Most casual sentences/i, rule: 'casual_sentence', category: 'tone' },
  { re: /考虑使用主动语态|Consider using active voice/i, rule: 'passive_voice', category: 'readability' },
  { re: /考虑移除或替换|Consider removing or replacing/i, rule: 'filler_phrase', category: 'tone' },
  { re: /替换太过复杂的词语|Replace overly complex words/i, rule: 'complex_word', category: 'readability' },
];

export function parseActionableIssuesFromSidebarText(
  sidebarText: string,
): SemrushActionableIssue[] {
  const issues: SemrushActionableIssue[] = [];

  for (const { re, rule, category } of SIDEBAR_HEADER_RULES) {
    const quotes = extractNumberedQuotesFromSidebarText(sidebarText, re);
    if (quotes.length === 0) continue;
    issues.push({
      category,
      rule,
      label: sidebarText.match(re)?.[0] ?? rule,
      quotes,
    });
  }

  return dedupeActionableIssues(issues);
}

/** 将 actionableIssues 的 quotes/terms 合并进扁平 suggestionDetails（兼容旧优化轮） */
export function mergeActionableIntoSuggestionDetails(
  details: SemrushSuggestionDetails,
  issues: SemrushActionableIssue[],
): SemrushSuggestionDetails {
  const merged: SemrushSuggestionDetails = {
    readability: [...(details.readability ?? [])],
    seo: [...(details.seo ?? [])],
    tone: [...(details.tone ?? [])],
    originality: [...(details.originality ?? [])],
  };

  const pushUnique = (key: keyof SemrushSuggestionDetails, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const list = merged[key] ?? [];
    if (!list.includes(trimmed)) list.push(trimmed);
    merged[key] = list;
  };

  for (const issue of issues) {
    const bucket = issue.category;
    if (issue.label && !isEnglishSentenceQuote(issue.label)) {
      pushUnique(bucket, issue.label);
    }
    for (const quote of issue.quotes ?? []) {
      if (isEnglishSentenceQuote(quote)) {
        pushUnique(bucket, quote);
      }
    }
    for (const term of issue.terms ?? []) {
      pushUnique(bucket, `${issue.label}: ${term}`);
    }
  }

  return merged;
}

/** DOM 未展开时，从 API/侧栏中文标题合成结构化规则（无原句 quotes） */
export function synthesizeActionableFromSuggestionDetails(
  details: SemrushSuggestionDetails,
): SemrushActionableIssue[] {
  const categories = ['readability', 'tone', 'originality'] as const;
  const issues: SemrushActionableIssue[] = [];

  for (const category of categories) {
    for (const item of details[category] ?? []) {
      const label = item.trim();
      if (!label || isEnglishSentenceQuote(label)) continue;
      const rule = classifySemrushIssueRule(label);
      if (rule === 'keyword' || rule === 'other') continue;
      issues.push({ category, rule, label });
    }
  }

  return dedupeActionableIssues(issues);
}

export function dedupeActionableIssues(issues: SemrushActionableIssue[]): SemrushActionableIssue[] {
  const seen = new Set<string>();
  const result: SemrushActionableIssue[] = [];

  for (const issue of issues) {
    const key = [
      issue.category,
      issue.rule,
      issue.label,
      ...(issue.quotes ?? []),
      ...(issue.terms ?? []),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }

  return result.slice(0, 40);
}
