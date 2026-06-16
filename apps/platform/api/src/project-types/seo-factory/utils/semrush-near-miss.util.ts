/**
 * Semrush 极近及格（如 8.9→9.0）：手术式改写，避免整篇 optimize 把分打低。
 */

import type { SeoScore, SemrushSuggestionDetails } from '@wm/provider-interfaces';
import {
  SEMRUSH_PASS_THRESHOLD,
  SEMRUSH_ULTRA_NEAR_MISS_MARGIN,
} from '../constants/seo-score';

const CASUAL_QUOTE_RE =
  /^[A-Za-z][^.!?]{8,280}[.!?]?$|^".+"$|^'.+'$/;

const COMPLEX_WORD_PATTERNS: Array<{ pattern: RegExp; replacement: string; word: string }> = [
  { word: 'compatibility', pattern: /\bcompatibility\b/gi, replacement: 'fit' },
  { word: 'utilize', pattern: /\butilize\b/gi, replacement: 'use' },
  { word: 'utilise', pattern: /\butilise\b/gi, replacement: 'use' },
  { word: 'facilitate', pattern: /\bfacilitate\b/gi, replacement: 'help' },
  { word: 'commence', pattern: /\bcommence\b/gi, replacement: 'start' },
  { word: 'heat up', pattern: /\bheat up\b/gi, replacement: 'overheat' },
  { word: 'analysis', pattern: /\broot-cause analysis\b/gi, replacement: 'root-cause review' },
  { word: 'analysis', pattern: /\bfault analysis\b/gi, replacement: 'fault review' },
];

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
): string[] {
  const quotes: string[] = [];
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
): string[] {
  const targets: string[] = [];
  const pools = [...(details?.readability ?? []), ...(details?.tone ?? [])];

  for (const item of pools) {
    if (!/复杂|complex|更换|replace|simplif/i.test(item)) continue;
    for (const { word } of COMPLEX_WORD_PATTERNS) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(content) && new RegExp(word, 'i').test(item)) {
        targets.push(word);
      }
    }
  }

  if (targets.length === 0 && /\bcompatibility\b/i.test(content)) {
    targets.push('compatibility');
  }

  return [...new Set(targets)].slice(0, 8);
}

/** 确定性替换：复杂词、填充词（不改结构） */
export function applySemrushNearMissDeterministicFixes(content: string): string {
  let result = content;
  for (const { pattern, replacement } of COMPLEX_WORD_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/\bBasically,\s*/gi, '');
  result = result.replace(/\bJust\s+(?=[A-Za-z])/gi, '');
  result = result.replace(/\bvery\s+(?=[A-Za-z])/gi, '');
  return result;
}

/** 极近及格时的 LLM 指令：只改列出的句子和词，禁止整篇重写 */
export function buildSemrushNearMissSurgicalInstruction(
  result: SeoScore,
  content: string,
): string | null {
  const details = result.suggestionDetails;
  const casualQuotes = extractSemrushCasualSentenceQuotes(details, content);
  const complexWords = extractSemrushComplexWordTargets(details, content);
  const pointsToGo = Math.max(
    0,
    Math.round((SEMRUSH_PASS_THRESHOLD - result.overall) * 10) / 10,
  );

  if (casualQuotes.length === 0 && complexWords.length === 0 && pointsToGo > 0.1) {
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
