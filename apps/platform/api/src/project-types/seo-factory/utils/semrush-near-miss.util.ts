/**
 * Semrush 极近及格（如 8.9→9.0）：手术式改写，避免整篇 optimize 把分打低。
 */

import type { SeoScore, SemrushSuggestionDetails } from '@wm/provider-interfaces';
import {
  applySemrushDefaultComplexWordFixes,
  detectHardToReadSentences,
  SEMRUSH_DEFAULT_COMPLEX_WORD_REPLACEMENTS,
} from '@wm/shared-core';
import {
  SEMRUSH_PASS_THRESHOLD,
  SEMRUSH_ULTRA_NEAR_MISS_MARGIN,
} from '../constants/seo-score';

const CASUAL_QUOTE_RE =
  /^[A-Za-z][^.!?]{8,280}[.!?]?$|^".+"$|^'.+'$/;

const COMPLEX_WORD_PATTERNS: Array<{ pattern: RegExp; replacement: string; word: string }> =
  Object.entries(SEMRUSH_DEFAULT_COMPLEX_WORD_REPLACEMENTS).map(([word, replacement]) => ({
    word,
    replacement,
    pattern: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
  }));

export function isSemrushUltraNearMiss(overall: number): boolean {
  return overall >= SEMRUSH_PASS_THRESHOLD - SEMRUSH_ULTRA_NEAR_MISS_MARGIN;
}

function isCasualSentenceQuote(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12 || trimmed.length > 320) return false;
  if (/^(重写|考虑|语气|Rewrite|Consider|Tone|添加|使用)/i.test(trimmed)) return false;
  return CASUAL_QUOTE_RE.test(trimmed);
}

function splitSentences(content: string): string[] {
  const sentences: string[] = [];
  const re = /([^.!?]+[.!?]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const sent = m[1].trim();
    if (sent.length >= 12) sentences.push(sent);
  }
  return sentences;
}

function findSentenceContaining(content: string, fragment: string): string | null {
  const needle = fragment.trim().slice(0, 40);
  if (needle.length < 8) return null;
  for (const sent of splitSentences(content)) {
    if (sent.includes(needle)) return sent;
  }
  return null;
}

/** 从 SWA 侧栏 tone/readability 条目 + 正文匹配，提取需改写的随意句原文 */
export function extractSemrushCasualSentenceQuotes(
  details: SemrushSuggestionDetails | undefined,
  content: string,
  actionableIssues?: SeoScore['actionableIssues'],
): string[] {
  const quotes: string[] = [];

  for (const issue of actionableIssues ?? []) {
    for (const quote of issue.quotes ?? []) {
      if (issue.rule === 'casual_sentence' || issue.rule === 'passive_voice') {
        quotes.push(quote.trim());
      }
    }
  }

  const pools = [...(details?.tone ?? []), ...(details?.readability ?? [])];

  for (const item of pools) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (isCasualSentenceQuote(trimmed)) {
      quotes.push(trimmed);
      continue;
    }
    const englishFragments = trimmed.match(/[A-Za-z][A-Za-z0-9\s,'-]{10,120}/g) ?? [];
    for (const frag of englishFragments) {
      const matched = findSentenceContaining(content, frag);
      if (matched) quotes.push(matched);
    }
  }

  return [...new Set(quotes)].slice(0, 12);
}

/** 侧栏标记的复杂词（在正文中存在时返回） */
export function extractSemrushComplexWordTargets(
  details: SemrushSuggestionDetails | undefined,
  content: string,
  actionableIssues?: SeoScore['actionableIssues'],
): string[] {
  const targets: string[] = [];

  for (const issue of actionableIssues ?? []) {
    if (issue.rule === 'complex_word') {
      for (const term of issue.terms ?? []) targets.push(term);
    }
  }

  const pools = [...(details?.readability ?? []), ...(details?.tone ?? [])];

  for (const item of pools) {
    if (!/复杂|complex|更换|replace|simplif/i.test(item)) continue;
    for (const { word } of COMPLEX_WORD_PATTERNS) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(content) && new RegExp(word, 'i').test(item)) {
        targets.push(word);
      }
    }
  }

  if (targets.length === 0) {
    const hasComplexSidebar = [...(details?.readability ?? []), ...(details?.tone ?? [])].some(
      (item) => /复杂|complex|更换|replace|simplif/i.test(item),
    );
    if (hasComplexSidebar && /\bcompatibility\b/i.test(content)) {
      targets.push('compatibility');
    }
  }

  return [...new Set(targets)].slice(0, 8);
}

/** 从 SWA 侧栏 readability 提取「难以阅读」的原句 */
export function extractSemrushHardToReadQuotes(
  details: SemrushSuggestionDetails | undefined,
  content: string,
  actionableIssues?: SeoScore['actionableIssues'],
): string[] {
  const quotes: string[] = [];

  for (const issue of actionableIssues ?? []) {
    if (issue.category === 'readability' && issue.rule === 'other') {
      for (const quote of issue.quotes ?? []) quotes.push(quote.trim());
    }
  }

  const pools = details?.readability ?? [];
  for (const item of pools) {
    if (!/难以阅读|difficult to read|hard to read/i.test(item)) continue;
    const englishFragments = item.match(/[A-Za-z][A-Za-z0-9\s,'-]{10,120}/g) ?? [];
    for (const frag of englishFragments) {
      const matched = findSentenceContaining(content, frag);
      if (matched) quotes.push(matched);
    }
  }

  if (quotes.length === 0) {
    for (const sample of detectHardToReadSentences(content).slice(0, 4)) {
      quotes.push(sample.text);
    }
  }

  return [...new Set(quotes)].slice(0, 8);
}

/** 仅替换 SWA 侧栏/actionable 点名的复杂词（Semrush 每轮 optimize 前执行） */
export function applySemrushSidebarComplexWordFixes(content: string, result: SeoScore): string {
  const targets = extractSemrushComplexWordTargets(
    result.suggestionDetails,
    content,
    result.actionableIssues,
  );
  if (targets.length === 0) {
    return applySemrushDefaultComplexWordFixes(content);
  }

  return applySemrushDefaultComplexWordFixes(content, targets);
}

/** 确定性替换：复杂词、填充词（不改结构） — 手术式 near-miss 专用 */
export function applySemrushNearMissDeterministicFixes(content: string): string {
  let result = applySemrushDefaultComplexWordFixes(content);
  result = result.replace(/\bBasically,\s*/gi, '');
  result = result.replace(/\bJust\s+(?=[A-Za-z])/gi, '');
  result = result.replace(/\bvery\s+(?=[A-Za-z])/gi, '');
  return result;
}

/** 词数缺口时的轻量 LLM 指令：只增补 FAQ，禁止改已有段落 */
export function buildSemrushWordGapSurgicalInstruction(
  result: SeoScore,
  gap: number,
  keyword: string,
): string | null {
  if (gap < 80) return null;
  const blockCount = Math.min(4, Math.max(2, Math.ceil(gap / 55)));
  const targetWords = result.semrushCompetitorWordCount ?? 0;
  const currentWords = result.semrushCurrentWordCount ?? 0;

  return [
    `Semrush Overall is ${result.overall}/10. Word count gap: need ~${gap} more words (current ${currentWords}, target ~${targetWords}).`,
    '',
    '**WORD-GAP MODE — add content ONLY. Do NOT rewrite, delete, or reorder existing paragraphs/H2s/links/images.**',
    '',
    `Add a new H2 section "## Common Buyer Questions" with ${blockCount} FAQ items (each 45–60 words).`,
    `Weave "${keyword}" naturally in 1–2 answers if it fits.`,
    'Use short sentences (≤18 words). Avoid complex words (traceability, serviceability, overdischarge).',
    'Return the FULL article with the new section inserted before the final summary/conclusion section.',
  ].join('\n');
}

/** 极近及格时的 LLM 指令：只改列出的句子和词，禁止整篇重写 */
export function buildSemrushNearMissSurgicalInstruction(
  result: SeoScore,
  content: string,
): string | null {
  const details = result.suggestionDetails;
  const casualQuotes = extractSemrushCasualSentenceQuotes(
    details,
    content,
    result.actionableIssues,
  );
  const complexWords = extractSemrushComplexWordTargets(
    details,
    content,
    result.actionableIssues,
  );
  const hardToReadQuotes = extractSemrushHardToReadQuotes(
    details,
    content,
    result.actionableIssues,
  );
  const pointsToGo = Math.max(
    0,
    Math.round((SEMRUSH_PASS_THRESHOLD - result.overall) * 10) / 10,
  );

  const wordGap =
    typeof result.semrushCompetitorWordCount === 'number' &&
    typeof result.semrushCurrentWordCount === 'number'
      ? result.semrushCompetitorWordCount - result.semrushCurrentWordCount
      : 0;

  if (
    casualQuotes.length === 0 &&
    complexWords.length === 0 &&
    hardToReadQuotes.length === 0 &&
    wordGap < 80 &&
    pointsToGo > 0.1
  ) {
    return null;
  }

  const lines = [
    `Semrush Overall is ${result.overall}/10 — need +${pointsToGo} to reach ${SEMRUSH_PASS_THRESHOLD}.`,
    '',
    '**SURGICAL MODE — change ONLY the items below. Do NOT rewrite other sentences, H2s, links, or images.**',
    '',
    'Rules for casual-sentence rewrites:',
    '- Make each flagged sentence slightly more formal (B2B procurement tone)',
    '- Keep the same facts; add a subject if missing; avoid slang and one-liners',
    '- Example: "Fault logs also matter." → "Fault logs also support warranty and service decisions."',
    '- Example: "Then check the real duty cycle." → "Next, verify the actual duty cycle against your load profile."',
    '',
  ];

  if (casualQuotes.length > 0) {
    lines.push('Rewrite ONLY these exact sentences in place (same section, same order):');
    for (const [i, quote] of casualQuotes.entries()) {
      lines.push(`${i + 1}. "${quote}"`);
    }
    lines.push('');
  }

  if (hardToReadQuotes.length > 0) {
    lines.push('Rewrite ONLY these hard-to-read sentences (split into 2 shorter sentences each):');
    for (const [i, quote] of hardToReadQuotes.entries()) {
      lines.push(`${i + 1}. "${quote}"`);
    }
    lines.push('');
  }

  if (complexWords.length > 0) {
    lines.push(
      `Replace complex words with simpler B2B terms where natural: ${complexWords.join(', ')}`,
    );
    lines.push('- compatibility → fit / work with; analysis → review (keep technical meaning)');
    lines.push('');
  }

  lines.push(
    'Also: use active voice where sidebar flagged passive; remove filler (just, very, basically).',
    'Word count must stay within ±3% of current length.',
    'Return the FULL article with only these surgical edits applied.',
  );

  return lines.join('\n');
}
