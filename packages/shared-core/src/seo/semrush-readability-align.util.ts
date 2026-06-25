/**
 * Semrush SWA 可读性对齐：复杂词、难读句、词数缺口（与侧栏规则一致）。
 *
 * 边界：
 * - 不负责：RPA 侧栏解析（semrush-actionable.util）
 */

import {
  calculateFleschReadingEase,
  isFleschAlignedWithSemrush,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  SEMRUSH_FLESCH_TOLERANCE,
} from './flesch-readability.util';
import { applyReadabilitySentenceFix } from './readability-fix.util';

export interface SemrushComplexWordSample {
  term: string;
  suggestion: string;
}

export interface HardToReadSentenceSample {
  text: string;
  wordCount: number;
  reasons: string[];
}

/** Semrush 侧栏常见复杂词 → B2B 简替（确定性） */
export const SEMRUSH_DEFAULT_COMPLEX_WORD_REPLACEMENTS: Record<string, string> = {
  traceability: 'clear records',
  overdischarge: 'deep discharge',
  serviceability: 'ease of service',
  compatibility: 'fit',
  utilize: 'use',
  utilise: 'use',
  facilitate: 'help',
  commence: 'start',
  aforementioned: 'above',
  leverage: 'use',
  overtemperature: 'overheating',
  implementation: 'rollout',
  functionality: 'features',
  optimization: 'tuning',
  methodologies: 'methods',
};

const COMPLEX_WORD_PATTERN = new RegExp(
  `\\b(${Object.keys(SEMRUSH_DEFAULT_COMPLEX_WORD_REPLACEMENTS).join('|')})\\b`,
  'gi',
);

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.trim().length > 0).length;
}

function splitBodySentences(content: string): string[] {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#+\s+/gm, ' ')
    .replace(/^[-*]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences: string[] = [];
  const re = /([^.!?]+[.!?]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(plain)) !== null) {
    const sent = match[1].trim();
    if (sent.length >= 12) sentences.push(sent);
  }
  return sentences;
}

/** 对齐 Semrush「重写难以阅读的句子」启发式 */
export function detectHardToReadSentences(content: string): HardToReadSentenceSample[] {
  const hits: HardToReadSentenceSample[] = [];

  for (const sentence of splitBodySentences(content)) {
    const wordCount = countWords(sentence);
    const reasons: string[] = [];
    const commaCount = (sentence.match(/,/g) ?? []).length;
    const andOrCount = (sentence.match(/\b(and|or)\b/gi) ?? []).length;

    if (wordCount > 24) reasons.push('long_sentence');
    if (wordCount > 18 && commaCount >= 2) reasons.push('multi_clause');
    if (wordCount > 16 && andOrCount >= 3) reasons.push('heavy_coordination');
    if (wordCount > 14 && /\bwhen\b.+\b(or|and)\b/i.test(sentence)) {
      reasons.push('nested_condition');
    }

    if (reasons.length > 0) {
      hits.push({ text: sentence.slice(0, 220), wordCount, reasons });
    }
  }

  return hits;
}

/**
 * SWA 侧栏「难以阅读」：将含 when 从句的句子拆成两句（去掉 when…or/and 同句模式）。
 */
export function splitSemrushWhenClauseSentences(content: string): string {
  let result = content;
  for (const sample of detectHardToReadSentences(content)) {
    if (!sample.reasons.includes('nested_condition')) continue;
    const whenMatch = sample.text.match(/^(.+?)\s+when\s+(.+)$/is);
    if (!whenMatch) continue;
    const prefix = whenMatch[1].trim().replace(/[,;:\s]+$/, '');
    let tail = whenMatch[2].trim().replace(/[.!?]+$/, '');
    if (!prefix || !tail) continue;
    tail = tail.charAt(0).toUpperCase() + tail.slice(1);
    const rewritten = `${prefix}. ${tail}.`;
    if (rewritten !== sample.text.trim()) {
      result = result.replace(sample.text, rewritten);
    }
  }
  return result;
}

/** Semrush 难读句确定性修复（when 从句拆分 + 默认复杂词） */
export function applySemrushHardToReadDeterministicFixes(content: string): string {
  let result = splitSemrushWhenClauseSentences(content);
  result = applySemrushDefaultComplexWordFixes(result);
  return result;
}

/** 本地/Sem 优化 Prompt：列出须重写的难读句原句（含 multi-clause，不限于 >22 词） */
export function formatHardToReadSentenceAuditBlock(input: {
  hits: number;
  maxAllowed?: number;
  samples?: HardToReadSentenceSample[];
}): string {
  const maxAllowed = input.maxAllowed ?? 2;
  const lines = [
    `Hard-to-read sentences: **${input.hits}** (max **${maxAllowed}** allowed — multi-clause / heavy and-or, not only >22 words).`,
  ];

  if (input.hits <= maxAllowed) {
    return lines.join('\n');
  }

  lines.push(
    '',
    '**Semrush SWA rule:** sentences with **`when … or/and`** in one clause count as hard-to-read — split into **two simple sentences** (remove `when`, do NOT keep `or`/`and` in the same sentence as `when`).',
  );

  lines.push(
    '',
    '**SURGICAL MODE — rewrite ONLY these sentences in place (split each into 2 shorter sentences, ≤22 words each):**',
  );

  const samples = input.samples ?? [];
  if (samples.length === 0) {
    lines.push(
      '(Scan for sentences with 2+ commas or 3+ and/or in one sentence; split at clause boundaries.)',
    );
    return lines.join('\n');
  }

  for (const [index, sample] of samples.slice(0, 6).entries()) {
    const reasonTag =
      sample.reasons.length > 0 ? ` [${sample.reasons.join(', ')}]` : '';
    lines.push(`${index + 1}. "${sample.text}" (${sample.wordCount} words${reasonTag})`);
  }

  return lines.join('\n');
}

/** 统计 Semrush 常见复杂词命中数 */
export function countSemrushComplexWordHits(content: string): number {
  return detectSemrushComplexWordSamples(content).length;
}

/** 列出正文中出现的 Semrush 复杂词及建议替换 */
export function detectSemrushComplexWordSamples(content: string): SemrushComplexWordSample[] {
  const seen = new Set<string>();
  const samples: SemrushComplexWordSample[] = [];

  for (const match of content.matchAll(COMPLEX_WORD_PATTERN)) {
    const term = match[1].toLowerCase();
    if (seen.has(term)) continue;
    seen.add(term);
    const suggestion = SEMRUSH_DEFAULT_COMPLEX_WORD_REPLACEMENTS[term];
    if (suggestion) samples.push({ term, suggestion });
  }

  return samples;
}

/** 确定性替换复杂词；onlyTerms 为空则替换文中所有已知复杂词 */
export function applySemrushDefaultComplexWordFixes(
  content: string,
  onlyTerms?: string[],
): string {
  let output = content;
  const allow = onlyTerms?.map((t) => t.toLowerCase());

  for (const [term, replacement] of Object.entries(SEMRUSH_DEFAULT_COMPLEX_WORD_REPLACEMENTS)) {
    if (allow && !allow.includes(term)) continue;
    const re = new RegExp(`\\b${term}\\b`, 'gi');
    if (re.test(output)) {
      output = output.replace(re, replacement);
    }
  }

  return output;
}

/** Flesch 低于 Semrush 目标时：复杂词替换 + 拆长句（确定性，LLM 之前跑） */
export function applyFleschTowardSemrushTarget(
  content: string,
  target: number = SEMRUSH_FLESCH_TARGET_DEFAULT,
): string {
  const before = calculateFleschReadingEase(content);
  if (isFleschAlignedWithSemrush(before, target, SEMRUSH_FLESCH_TOLERANCE)) {
    return content;
  }

  let output = applySemrushDefaultComplexWordFixes(content);
  if (!isFleschAlignedWithSemrush(calculateFleschReadingEase(output), target, SEMRUSH_FLESCH_TOLERANCE)) {
    output = applyReadabilitySentenceFix(output);
    for (let i = 0; i < 4; i += 1) {
      const next = applyReadabilitySentenceFix(output);
      if (next === output) break;
      output = next;
    }
    output = applySemrushDefaultComplexWordFixes(output);
  }

  const after = calculateFleschReadingEase(output);
  if (before < target && after < before) return content;
  if (before > target + SEMRUSH_FLESCH_TOLERANCE && after > before) return content;
  return output;
}

export interface WordGapInjectionResult {
  content: string;
  injectedWords: number;
  blockCount: number;
}

function buildFaqBlock(keyword: string, index: number): string {
  const topic = keyword.trim() || 'this system';
  const templates = [
    `### What should buyers verify before they choose a ${topic}?\n\nTeams should confirm voltage limits, current ratings, communication options, and firmware support. A short bench test with charger, load, and alarm settings reduces rollout risk.`,
    `### How does remote monitoring help daily operations?\n\nRemote monitoring gives service teams live status, fault history, and alarm context. That visibility supports faster triage and fewer repeat site visits.`,
    `### Which integration steps matter most during rollout?\n\nAlign fault signals, data IDs, and charger behavior before fleet deployment. Document firmware version, parameter files, and alarm thresholds for each site.`,
    `### How can teams reduce warranty and support risk?\n\nUse event logs, clear alarm rules, and stable app releases. Train operators on normal shutdown, sleep, and charge modes before scale deployment.`,
  ];
  return templates[index % templates.length];
}

/**
 * 词数缺口 ≥80 时确定性插入 FAQ 段（约 50 词/条），不改动已有段落。
 */
export function injectSemrushWordCountExpansion(
  content: string,
  gap: number,
  keyword: string,
): WordGapInjectionResult {
  if (gap < 55) {
    return { content, injectedWords: 0, blockCount: 0 };
  }

  const blockCount = Math.min(4, Math.max(2, Math.ceil(gap / 55)));
  const blocks: string[] = ['## Common Buyer Questions'];
  for (let i = 0; i < blockCount; i += 1) {
    blocks.push(buildFaqBlock(keyword, i));
  }
  const injection = blocks.join('\n\n');
  const injectedWords = countWords(injection);

  const trimmed = content.trim();
  const lastH2 = trimmed.lastIndexOf('\n## ');
  if (lastH2 > trimmed.length * 0.5) {
    return {
      content: `${trimmed.slice(0, lastH2).trim()}\n\n${injection}\n\n${trimmed.slice(lastH2 + 1).trim()}`,
      injectedWords,
      blockCount,
    };
  }

  return {
    content: `${trimmed}\n\n${injection}`,
    injectedWords,
    blockCount,
  };
}

/** 写作/扩写目标：SWA 标杆 +5%（Markdown 宜略高于 SWA 统计） */
export const SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO = 0.05;
/** 篇幅可接受上限：标杆 +15%（105%–115% 为理想区间） */
export const SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO = 0.15;
/** API 与本地词数差超过该值时记为对齐修正 */
export const SEMRUSH_WORD_COUNT_RECONCILE_LOG_THRESHOLD = 80;
/** 超过竞品/SWA 目标该比例时须删减（例：822 标杆 → >986 词触发） */
export const SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO = 0.2;

export function isSemrushWordCountOverTarget(
  currentWords: number,
  targetWordCount: number,
): boolean {
  if (targetWordCount <= 0 || currentWords <= 0) return false;
  return currentWords > targetWordCount * (1 + SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO);
}

/** 当前词数超出目标的比例（仅超标时为正数） */
export function computeSemrushWordCountOverRatio(
  currentWords: number,
  targetWordCount: number,
): number | null {
  if (targetWordCount <= 0) return null;
  if (currentWords <= targetWordCount) return null;
  return (currentWords - targetWordCount) / targetWordCount;
}

export interface SemrushWordCountReconcileResult {
  effectiveCurrentWords: number;
  localWordCount: number;
  apiReportedWords?: number;
  domReportedWords?: number;
  reconciled: boolean;
}

export interface SemrushWordCountPlan {
  localWordCount: number;
  apiReportedWords?: number;
  effectiveCurrentWords: number;
  competitorWordCount?: number;
  /** SWA 视角缺口：竞品标杆 − 对齐后当前词数 */
  swaGap: number | null;
  /** 本地 Markdown 扩写目标（略高于 SWA 竞品标杆） */
  localExpandTarget?: number;
  /** 本地扩写缺口：localExpandTarget − localWordCount */
  localExpandGap: number;
  /** 超出 SWA 目标的比例（仅超标时） */
  swaOverRatio: number | null;
  /** 超过目标 20% 时须删减 */
  wordCountTrimPriority: boolean;
  reconciled: boolean;
}

/**
 * 对齐 SWA 有效当前词数：取 API / 本地 / DOM 中最保守（最小）值。
 * SWA 打分以编辑器统计为准，不可单独信任 API original_length。
 */
export function resolveSemrushEffectiveCurrentWordCount(input: {
  localWordCount: number;
  apiCurrentWords?: number;
  domCurrentWords?: number;
}): SemrushWordCountReconcileResult {
  const candidates: number[] = [input.localWordCount];
  if (typeof input.apiCurrentWords === 'number' && input.apiCurrentWords > 0) {
    candidates.push(input.apiCurrentWords);
  }
  if (typeof input.domCurrentWords === 'number' && input.domCurrentWords > 0) {
    candidates.push(input.domCurrentWords);
  }
  const effectiveCurrentWords = Math.min(...candidates);
  const apiReported =
    typeof input.apiCurrentWords === 'number' && input.apiCurrentWords > 0
      ? input.apiCurrentWords
      : undefined;
  const reconciled =
    apiReported != null &&
    apiReported - effectiveCurrentWords >= SEMRUSH_WORD_COUNT_RECONCILE_LOG_THRESHOLD;

  return {
    effectiveCurrentWords,
    localWordCount: input.localWordCount,
    apiReportedWords: apiReported,
    domReportedWords:
      typeof input.domCurrentWords === 'number' && input.domCurrentWords > 0
        ? input.domCurrentWords
        : undefined,
    reconciled,
  };
}

/** 本地扩写目标：SWA 标杆 +5% */
export function resolveSemrushExpandWordTarget(competitorWordCount: number): number {
  return Math.round(competitorWordCount * (1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO));
}

/** 删减目标区间：标杆 +5% 至 +15% */
export function resolveSemrushTrimWordTargetRange(competitorWordCount: number): {
  min: number;
  max: number;
} {
  return {
    min: resolveSemrushExpandWordTarget(competitorWordCount),
    max: Math.round(competitorWordCount * (1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO)),
  };
}

/** 篇幅硬上限：标杆 +20% */
export function resolveSemrushWordCountHardCap(competitorWordCount: number): number {
  return Math.round(competitorWordCount * (1 + SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO));
}

/** 汇总词数对齐、SWA 缺口与本地扩写目标 */
export function buildSemrushWordCountPlan(input: {
  content: string;
  competitorWordCount?: number;
  apiReportedWords?: number;
  domCurrentWords?: number;
}): SemrushWordCountPlan {
  const localWordCount = countWords(input.content);
  const reconcile = resolveSemrushEffectiveCurrentWordCount({
    localWordCount,
    apiCurrentWords: input.apiReportedWords,
    domCurrentWords: input.domCurrentWords,
  });
  const competitor =
    typeof input.competitorWordCount === 'number' && input.competitorWordCount > 0
      ? input.competitorWordCount
      : undefined;
  const swaGap =
    competitor != null
      ? Math.max(0, competitor - reconcile.effectiveCurrentWords)
      : null;
  const localExpandTarget =
    competitor != null ? resolveSemrushExpandWordTarget(competitor) : undefined;
  const localExpandGap =
    localExpandTarget != null ? Math.max(0, localExpandTarget - localWordCount) : 0;
  const swaOverRatio =
    competitor != null
      ? computeSemrushWordCountOverRatio(reconcile.effectiveCurrentWords, competitor)
      : null;
  const wordCountTrimPriority =
    competitor != null &&
    (isSemrushWordCountOverTarget(reconcile.effectiveCurrentWords, competitor) ||
      isSemrushWordCountOverTarget(localWordCount, competitor));

  return {
    localWordCount,
    apiReportedWords: reconcile.apiReportedWords,
    effectiveCurrentWords: reconcile.effectiveCurrentWords,
    competitorWordCount: competitor,
    swaGap,
    localExpandTarget,
    localExpandGap,
    swaOverRatio,
    wordCountTrimPriority,
    reconciled: reconcile.reconciled,
  };
}

/** 计算 Semrush 词数缺口（竞品标杆 − 当前） */
export function computeSemrushWordGap(
  currentWords: number | undefined,
  competitorWords: number | undefined,
): number | null {
  if (typeof currentWords !== 'number' || typeof competitorWords !== 'number') return null;
  return competitorWords - currentWords;
}

const DEFAULT_CALIBRATION_TARGET_WORD_COUNT = 1500;

/**
 * 无 SWA 侧栏词数时推断目标篇幅（对齐 Semrush：当前词数 + ~15%，非固定 1500）。
 * 例：774 词 → 目标约 890（侧栏常见 887）。
 */
export function inferSemrushWordCountTarget(currentWords: number): number {
  if (currentWords >= 550 && currentWords <= 1300) {
    return Math.round(currentWords * 1.15);
  }
  if (currentWords > 0 && currentWords < 550) {
    return Math.max(700, Math.round(currentWords * 1.2));
  }
  return DEFAULT_CALIBRATION_TARGET_WORD_COUNT;
}

/** 校准用词数缺口：有竞品用竞品，否则用 SWA 推断目标（禁止 null 当 0 对齐） */
export function resolveCalibrationWordGap(input: {
  wordCount: number;
  competitorWordCount?: number;
  targetWordCount?: number;
}): number {
  if (typeof input.competitorWordCount === 'number' && input.competitorWordCount > 0) {
    return Math.max(0, input.competitorWordCount - input.wordCount);
  }
  const target =
    input.targetWordCount ??
    inferSemrushWordCountTarget(input.wordCount);
  return Math.max(0, target - input.wordCount);
}

export const SEMRUSH_TITLE_MAX_CHARS = 60;
export const SEMRUSH_TITLE_WORD_MIN = 5;
export const SEMRUSH_TITLE_WORD_MAX = 12;

import {
  analyzeSemrushTitleTargetKeywordIssues,
  type SemrushTitleKeywordIssueCode,
} from './semrush-title-keyword-rule.util';

export type SemrushTitleIssueCode =
  | 'missing'
  | 'too_long'
  | 'too_many_words'
  | 'too_few_words'
  | SemrushTitleKeywordIssueCode;

export interface SemrushTitleIssue {
  code: SemrushTitleIssueCode;
  message: string;
}

function roundSemrushScore(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 解析 Semrush SWA 评测用标题：与 RPA 粘贴正文一致（H1 → 首行 → draft.title → 关键词） */
export function resolveSemrushArticleTitle(input: {
  content: string;
  targetKeyword: string;
  articleTitle?: string;
}): string {
  const fromH1 = input.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (fromH1) return fromH1.slice(0, 200);
  const firstLine = input.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine && !firstLine.startsWith('#')) return firstLine.slice(0, 200);
  const explicit = input.articleTitle?.trim();
  if (explicit) return explicit.slice(0, 200);
  return input.targetKeyword.trim().slice(0, 200) || '(untitled)';
}

/** 对齐 Semrush SWA 侧栏：标题缺失 / 超长 / 词数不当 / 目标关键词固定规则 */
export function analyzeSemrushTitleIssues(
  title: string,
  targetKeywords?: string[],
): SemrushTitleIssue[] {
  const trimmed = title.trim();
  const issues: SemrushTitleIssue[] = [];
  if (!trimmed || trimmed === '(untitled)') {
    issues.push({ code: 'missing', message: '文章缺少标题（Semrush 将其作为首段/H1）' });
    if (targetKeywords?.length) {
      for (const issue of analyzeSemrushTitleTargetKeywordIssues(title, targetKeywords)) {
        issues.push({ code: issue.code, message: issue.message });
      }
    }
    return issues;
  }
  if (trimmed.length > SEMRUSH_TITLE_MAX_CHARS) {
    issues.push({
      code: 'too_long',
      message: `标题 ${trimmed.length} 字符，超过 Semrush 建议 ${SEMRUSH_TITLE_MAX_CHARS}（搜索结果可能被截断）`,
    });
  }
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > SEMRUSH_TITLE_WORD_MAX) {
    issues.push({
      code: 'too_many_words',
      message: `标题 ${wordCount} 词，Semrush 建议 ${SEMRUSH_TITLE_WORD_MIN}–${SEMRUSH_TITLE_WORD_MAX} 词`,
    });
  } else if (wordCount > 0 && wordCount < SEMRUSH_TITLE_WORD_MIN) {
    issues.push({
      code: 'too_few_words',
      message: `标题 ${wordCount} 词，Semrush 建议 ${SEMRUSH_TITLE_WORD_MIN}–${SEMRUSH_TITLE_WORD_MAX} 词`,
    });
  }
  if (targetKeywords?.length) {
    for (const issue of analyzeSemrushTitleTargetKeywordIssues(trimmed, targetKeywords)) {
      issues.push({ code: issue.code, message: issue.message });
    }
  }
  return issues;
}

/** 标题问题对 Overall 0–10 的保守扣分（正文规则分无法反映 SWA 标题项） */
export function computeSemrushTitleOverallPenalty(title: string): number {
  const issues = analyzeSemrushTitleIssues(title);
  if (issues.length === 0) return 0;

  let penalty = 0;
  for (const issue of issues) {
    if (issue.code === 'missing') penalty += 0.4;
    if (issue.code === 'too_long') {
      const excess = Math.max(0, title.trim().length - SEMRUSH_TITLE_MAX_CHARS);
      penalty += 0.35 + Math.min(0.45, excess * 0.012);
    }
    if (issue.code === 'too_many_words') {
      const words = title.trim().split(/\s+/).filter(Boolean).length;
      penalty += 0.25 + Math.min(0.35, Math.max(0, words - SEMRUSH_TITLE_WORD_MAX) * 0.035);
    }
    if (issue.code === 'too_few_words') {
      penalty += 0.2;
    }
    if (issue.code === 'no_target_keyword_in_title') {
      penalty += 0.3;
    }
    if (issue.code === 'target_keyword_repeated_in_title') {
      penalty += 0.25;
    }
  }
  return roundSemrushScore(Math.min(1.2, penalty));
}

export function applySemrushTitlePenaltyToPrediction(predicted: number, title: string): number {
  const penalty = computeSemrushTitleOverallPenalty(title);
  if (penalty <= 0) return roundSemrushScore(predicted);
  return roundSemrushScore(Math.max(0, Math.min(10, predicted - penalty)));
}

/** 将过长 H1 截断到 Semrush 建议范围（本地轮前置，避免预测分被扣 ≥0.35） */
export function fixSemrushArticleTitleInContent(
  content: string,
  targetKeyword: string,
): string {
  const h1Match = content.match(/^(#\s+)(.+)$/m);
  if (!h1Match) return content;

  const prefix = h1Match[1];
  const title = h1Match[2].trim();
  if (analyzeSemrushTitleIssues(title).length === 0) return content;

  const keywordTokens = targetKeyword
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  let trimmed = title;

  if (trimmed.length > SEMRUSH_TITLE_MAX_CHARS) {
    const slice = trimmed.slice(0, SEMRUSH_TITLE_MAX_CHARS);
    const lastSpace = slice.lastIndexOf(' ');
    trimmed = lastSpace > SEMRUSH_TITLE_MAX_CHARS * 0.55 ? slice.slice(0, lastSpace) : slice;
    trimmed = trimmed.replace(/[\s,:;-]+$/, '');
  }

  let words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > SEMRUSH_TITLE_WORD_MAX) {
    words = words.slice(0, SEMRUSH_TITLE_WORD_MAX);
    trimmed = words.join(' ');
  }

  const lowerTitle = trimmed.toLowerCase();
  const missingKeyword = keywordTokens.some((t) => !lowerTitle.includes(t));
  if (missingKeyword && targetKeyword.trim()) {
    const kw = targetKeyword.trim();
    const candidate = `${kw}: ${trimmed}`;
    if (candidate.length <= SEMRUSH_TITLE_MAX_CHARS) {
      trimmed = candidate;
    } else {
      const room = SEMRUSH_TITLE_MAX_CHARS - kw.length - 2;
      if (room > 10) {
        trimmed = `${kw}: ${trimmed.slice(0, room).replace(/[\s,:;-]+$/, '')}`;
      }
    }
  }

  if (trimmed === title) return content;
  return content.replace(/^(#\s+).+$/m, `${prefix}${trimmed}`);
}
