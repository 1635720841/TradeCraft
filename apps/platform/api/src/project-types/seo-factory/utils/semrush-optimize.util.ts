/**
 * Semrush 优化轮：建议合并、可读性诊断、提分计划（以 SWA Overall ≥9.0 为唯一目标）。
 */

import type { SeoScore } from '@wm/provider-interfaces';
import {
  countWords,
  extractLongParagraphs,
  extractLongSentences,
  injectSemrushWordCountExpansion,
  resolveSemrushReadabilityTarget,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  SEMRUSH_FLESCH_TOLERANCE,
  SEMRUSH_PARAGRAPH_MAX_SENTENCES,
  SEMRUSH_PARAGRAPH_MAX_WORDS,
  buildSemrushWordCountPlan,
  SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO,
  SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO,
  resolveSemrushTrimWordTargetRange,
  type BoostLocalSeoContentOptions,
} from '@wm/shared-core';
import { SEMRUSH_PASS_THRESHOLD } from '../constants/seo-score';
import { buildContextualKeywordWeavingInstruction, isSemrushKeywordStrictlyPresent } from '../providers/semrush/semrush-keyword-coverage.util';
import { isWeakExtractedPhrase } from '../providers/semrush/semrush-keywords.util';
import {
  resolveOptimizeWordCountTarget,
  shouldPrioritizeWordCountExpand,
  OPTIMIZE_WORD_COUNT_EXPAND_GAP_THRESHOLD,
} from '../modules/llm/optimize-context.util';

export { buildContextualKeywordWeavingInstruction, resolveSemrushReadabilityTarget };

const SUGGESTION_CAP = 28;

const PARAGRAPH_ISSUE_RE =
  /段落太长|拆分长段|paragraph.*too long|split.*paragraph|long paragraph/i;
const TOO_PLAIN_READABILITY_RE =
  /太过浅显|语言平实|更高级|professional audience|too plain|too simple|too easy|plain language/i;
const CASUAL_QUOTE_RE =
  /^[A-Za-z][^.!?]{8,280}[.!?]?$|^".+"$|^'.+'$/;

export function buildSemrushReadabilityAudit(content: string): {
  longSentenceCount: number;
  longParagraphCount: number;
  promptText: string;
} {
  const longSentences = extractLongSentences(content);
  const longParagraphs = extractLongParagraphs(
    content,
    SEMRUSH_PARAGRAPH_MAX_WORDS,
    SEMRUSH_PARAGRAPH_MAX_SENTENCES,
  );

  const lines = [
    `SWA structure scan: ${longSentences.length} sentences >22 words (cap ≤2), ${longParagraphs.length} paragraphs >${SEMRUSH_PARAGRAPH_MAX_WORDS} words or >${SEMRUSH_PARAGRAPH_MAX_SENTENCES} sentences (cap ≤1).`,
  ];

  if (longParagraphs.length > 0) {
    lines.push('Split EVERY paragraph below (blank line between chunks, ≤60 words each):');
    for (const sample of longParagraphs.slice(0, 4)) {
      const preview = sample.text.slice(0, 100);
      lines.push(
        `• "${preview}${sample.text.length > 100 ? '…' : ''}" (${sample.wordCount} words)`,
      );
    }
  }

  if (longSentences.length > 2) {
    lines.push('Split EVERY sentence below to ≤22 words:');
    for (const sample of longSentences.slice(0, 5)) {
      const preview = sample.text.slice(0, 100);
      lines.push(
        `• "${preview}${sample.text.length > 100 ? '…' : ''}" (${sample.wordCount} words)`,
      );
    }
  }

  return {
    longSentenceCount: longSentences.length,
    longParagraphCount: longParagraphs.length,
    promptText: lines.join('\n'),
  };
}

export function buildSemrushScoreGapPlan(result: SeoScore, pointsToGo: number): string {
  const sections: string[] = [];
  const details = result.suggestionDetails;

  if (pointsToGo > 0) {
    sections.push(
      `Semrush Overall is ${result.overall}/10 — need +${pointsToGo} to reach ${SEMRUSH_PASS_THRESHOLD}.`,
    );
  }

  const push = (label: string, items?: string[]) => {
    if (!items?.length) return;
    sections.push(`${label}: ${items.slice(0, 4).join(' | ')}`);
  };

  push('Readability', details?.readability);
  push('SEO', details?.seo);
  push('Tone', details?.tone);
  push('Originality', details?.originality);

  if ((result.semrushRecommendedKeywords?.length ?? 0) > 0) {
    sections.push(
      `Required SWA terms (each ≥1×): ${result.semrushRecommendedKeywords!.slice(0, 8).join(', ')}`,
    );
  }

  if (sections.length === 0) {
    return 'Fix every SWA sidebar red-dot item; split long paragraphs and casual sentences first.';
  }

  return sections.join('\n');
}

export interface SemrushOptimizeContext {
  readabilityPriority: boolean;
  wordCountExpandPriority: boolean;
  wordCountTrimPriority: boolean;
  readabilityAudit: string;
  pointsToGo: number;
  scoreGapPlan: string;
}

export interface SemrushRoundOutputGuardResult {
  accepted: boolean;
  reasons: string[];
  wordsBefore: number;
  wordsAfter: number;
  minWordCount?: number;
  missingKeywords: string[];
}

export interface SemrushRoundRepairResult {
  content: string;
  changed: boolean;
  addedKeywords: string[];
  wordsBefore: number;
  wordsAfter: number;
  injectedWordBlocks: number;
}

/** Semrush 轮优化上下文：以 SWA 分数与正文结构为准，不依赖本地预检是否已过关 */
export function buildSemrushOptimizeContext(
  semrushResult: SeoScore,
  content: string,
): SemrushOptimizeContext {
  const pointsToGo = Math.max(
    0,
    Math.round((SEMRUSH_PASS_THRESHOLD - semrushResult.overall) * 10) / 10,
  );
  const audit = buildSemrushReadabilityAudit(content);
  const details = semrushResult.suggestionDetails;

  const hasSidebarIssues =
    (details?.readability?.length ?? 0) > 0 ||
    (details?.seo?.length ?? 0) > 0 ||
    (details?.tone?.length ?? 0) > 0 ||
    (details?.originality?.length ?? 0) > 0;

  const competitorWords = semrushResult.semrushCompetitorWordCount;
  const wordPlan = buildSemrushWordCountPlan({
    content,
    competitorWordCount: competitorWords,
    apiReportedWords: semrushResult.semrushCurrentWordCount,
  });
  const wordCountExpandGap = wordPlan.swaGap ?? 0;
  const wordCountExpandPriority =
    !wordPlan.wordCountTrimPriority && shouldPrioritizeWordCountExpand(wordCountExpandGap);
  const wordCountTrimPriority = wordPlan.wordCountTrimPriority;

  const readabilityPriority =
    semrushResult.overall < SEMRUSH_PASS_THRESHOLD &&
    !wordCountExpandPriority &&
    !wordCountTrimPriority &&
    (hasSidebarIssues ||
      audit.longParagraphCount > 0 ||
      audit.longSentenceCount > 2 ||
      pointsToGo <= 0.2);

  return {
    readabilityPriority,
    wordCountExpandPriority,
    wordCountTrimPriority,
    readabilityAudit: audit.promptText,
    pointsToGo,
    scoreGapPlan: buildSemrushScoreGapPlan(semrushResult, pointsToGo),
  };
}

function uniqueKeywords(keywords: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords) {
    const phrase = raw.trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
  }
  return result;
}

function missingStrictKeywords(content: string, keywords: string[]): string[] {
  return uniqueKeywords(keywords).filter(
    (phrase) => !isSemrushKeywordStrictlyPresent(content, phrase),
  );
}

function chunkKeywords(keywords: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < keywords.length; index += size) {
    chunks.push(keywords.slice(index, index + size));
  }
  return chunks;
}

function buildKeywordRepairBlock(targetKeyword: string, keywords: string[]): string {
  const groups = chunkKeywords(keywords, 3);
  const blocks = ['## Additional Selection Checks'];
  for (const [index, group] of groups.entries()) {
    const headingTerm = group[0];
    blocks.push(
      [
        `### How should buyers verify ${headingTerm}?`,
        '',
        `When comparing ${targetKeyword}, document ${group.join(', ')} in the same review. Connect these requirements to charging behavior, protection limits, monitoring data, service access, and supplier support before installation.`,
        index === groups.length - 1
          ? 'This keeps the final specification easier to inspect, quote, and maintain over the long term.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return blocks.join('\n\n');
}

export function evaluateSemrushRoundOutput(input: {
  beforeContent: string;
  afterContent: string;
  keywordBatch?: string[];
  wordCountExpandPriority?: boolean;
  localExpandTarget?: number;
  shrinkToleranceWords?: number;
}): SemrushRoundOutputGuardResult {
  const wordsBefore = countWords(input.beforeContent);
  const wordsAfter = countWords(input.afterContent);
  const reasons: string[] = [];
  const missingKeywords = missingStrictKeywords(input.afterContent, input.keywordBatch ?? []);

  let minWordCount: number | undefined;
  if (input.wordCountExpandPriority) {
    const tolerance = input.shrinkToleranceWords ?? 30;
    if (wordsAfter < wordsBefore - tolerance) {
      reasons.push('shrank_body');
    }

    if (input.localExpandTarget && input.localExpandTarget > wordsBefore) {
      minWordCount = Math.min(input.localExpandTarget, wordsBefore + 40);
      if (wordsAfter < minWordCount) {
        reasons.push('missed_expand_floor');
      }
    }
  }

  if (missingKeywords.length > 0) {
    reasons.push('missing_round_keywords');
  }

  return {
    accepted: reasons.length === 0,
    reasons: [...new Set(reasons)],
    wordsBefore,
    wordsAfter,
    minWordCount,
    missingKeywords,
  };
}

export function repairSemrushRoundOutput(input: {
  content: string;
  targetKeyword: string;
  keywordBatch?: string[];
  wordCountExpandPriority?: boolean;
  localExpandTarget?: number;
}): SemrushRoundRepairResult {
  const wordsBefore = countWords(input.content);
  let content = input.content.trim();
  const addedKeywords = missingStrictKeywords(content, input.keywordBatch ?? []);

  if (addedKeywords.length > 0) {
    content = `${content}\n\n${buildKeywordRepairBlock(input.targetKeyword, addedKeywords)}`;
  }

  let injectedWordBlocks = 0;
  if (input.wordCountExpandPriority && input.localExpandTarget) {
    const gap = input.localExpandTarget - countWords(content);
    if (gap >= 55) {
      const injected = injectSemrushWordCountExpansion(content, gap, input.targetKeyword);
      content = injected.content;
      injectedWordBlocks = injected.blockCount;
    }
  }

  const wordsAfter = countWords(content);
  return {
    content,
    changed: content !== input.content.trim(),
    addedKeywords,
    wordsBefore,
    wordsAfter,
    injectedWordBlocks,
  };
}

function isCasualSentenceQuote(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12 || trimmed.length > 320) return false;
  if (/^(重写|考虑|语气|Rewrite|Consider|Tone)/i.test(trimmed)) return false;
  return CASUAL_QUOTE_RE.test(trimmed);
}

/** 合并 SWA 侧栏建议 + 正文结构诊断，供 Semrush 优化轮 LLM 改写 */
export function buildSemrushRewriteSuggestions(result: SeoScore, content: string): string[] {
  const lines: string[] = [];
  const details = result.suggestionDetails;

  const pushSection = (label: string, items?: string[]) => {
    for (const item of items ?? []) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      lines.push(trimmed.startsWith('[') ? trimmed : `[${label}] ${trimmed}`);
    }
  };

  pushSection('可读性', details?.readability);
  pushSection('SEO', details?.seo);
  pushSection('原创性', details?.originality);

  const readabilitySignals = [
    ...(details?.readability ?? []),
    ...(details?.tone ?? []),
    ...result.suggestions,
  ].join('\n');
  if (TOO_PLAIN_READABILITY_RE.test(readabilitySignals)) {
    lines.unshift(
      '[可读性·必做] Semrush 认为文本过于浅显/随意：不要继续拆成短命令句；把连续 Measure/Check/Replace/Stop/Seat/Wait 句合并为 16–24 词的技术解释句，加入原因、风险、判断依据或操作条件；仍保持每段 ≤60 词。',
    );
  }

  for (const item of details?.tone ?? []) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (isCasualSentenceQuote(trimmed)) {
      lines.push(`[语气·必做] 改写此随意句: ${trimmed}`);
    } else {
      lines.push(`[语气] ${trimmed}`);
    }
  }

  for (const item of result.suggestions) {
    const trimmed = item.trim();
    if (trimmed) lines.push(trimmed);
  }

  const recommended = result.semrushRecommendedKeywords ?? [];
  const missingTarget = result.semrushMissingTargetKeywords ?? [];
  const missingRecommended = result.semrushMissingRecommendedKeywords ?? [];

  const missingAll = [...missingTarget, ...missingRecommended];
  let keywordWeaving = '';
  if (missingAll.length > 0) {
    keywordWeaving = buildContextualKeywordWeavingInstruction(missingAll);
  } else if (recommended.length > 0) {
    const uncovered = recommended.filter(
      (phrase) =>
        !isWeakExtractedPhrase(phrase) &&
        !isSemrushKeywordStrictlyPresent(content, phrase),
    );
    if (uncovered.length > 0) {
      keywordWeaving = `[SEO] SWA 推荐词须各至少出现 1 次（语境化融合，禁止列表堆砌、独立短句堆词或连续祈使句）: ${uncovered.join(', ')}`;
    }
  }

  for (const issue of result.actionableIssues ?? []) {
    for (const quote of issue.quotes ?? []) {
      const trimmed = quote.trim();
      if (!trimmed) continue;
      const tag =
        issue.rule === 'passive_voice'
          ? '可读性·被动'
          : issue.rule === 'complex_word'
            ? '可读性·复杂词'
            : issue.rule === 'casual_sentence'
              ? '语气·随意句'
              : issue.rule === 'filler_phrase'
                ? '语气·填充词'
                : issue.category;
      lines.unshift(
        `[${tag}·必做] 改写: "${trimmed.slice(0, 100)}${trimmed.length > 100 ? '…' : ''}"`,
      );
    }
    for (const term of issue.terms ?? []) {
      if (issue.rule === 'keyword') {
        if (missingAll.length > 0) continue;
        const weaving = buildContextualKeywordWeavingInstruction([term]);
        lines.unshift(weaving || `[SEO] 须自然融合: ${term}`);
      } else {
        lines.unshift(`[可读性·复杂词·必做] 替换词语: ${term}`);
      }
    }
  }

  const audit = buildSemrushReadabilityAudit(content);
  if (audit.longParagraphCount > 0) {
    for (const sample of extractLongParagraphs(
      content,
      SEMRUSH_PARAGRAPH_MAX_WORDS,
      SEMRUSH_PARAGRAPH_MAX_SENTENCES,
    ).slice(0, 3)) {
      const preview = sample.text.slice(0, 90);
      lines.unshift(
        `[可读性·必做] 拆分超长段（${sample.wordCount} 词）: "${preview}${sample.text.length > 90 ? '…' : ''}"`,
      );
    }
  } else if (
    !(details?.readability ?? []).some((t) => PARAGRAPH_ISSUE_RE.test(t)) &&
    result.overall < SEMRUSH_PASS_THRESHOLD
  ) {
    lines.unshift(
      '[可读性·必做] 全文每段 ≤60 词（2–3 句）；技术枚举改列表，避免 SWA 编辑器标紫「段落太长」',
    );
  }

  if (audit.longSentenceCount > 2) {
    lines.unshift(
      `[可读性·必做] 将超长句从 ${audit.longSentenceCount} 条压到 ≤2 条（单句 ≤22 词）`,
    );
  }

  const competitorWords = result.semrushCompetitorWordCount;
  const wordPlan = buildSemrushWordCountPlan({
    content,
    competitorWordCount: competitorWords,
    apiReportedWords: result.semrushCurrentWordCount,
  });
  if (
    wordPlan.swaGap != null &&
    wordPlan.swaGap > OPTIMIZE_WORD_COUNT_EXPAND_GAP_THRESHOLD &&
    wordPlan.localExpandTarget != null
  ) {
    const localTarget = wordPlan.localExpandTarget;
    const faqCount = Math.min(4, Math.max(2, Math.ceil(wordPlan.localExpandGap / 50)));
    lines.unshift(
      `[可读性·必做] SWA 统计约 ${wordPlan.effectiveCurrentWords} 词，竞品标杆 ${wordPlan.competitorWordCount} 词（缺 ${wordPlan.swaGap} 词）：本地扩写至 ${localTarget - 5}–${localTarget} 词（标杆 +${Math.round(SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO * 100)}%）；优先加 ${faqCount} 条 FAQ（每条 40–60 词）`,
    );
  }

  if (wordPlan.wordCountTrimPriority && wordPlan.competitorWordCount != null) {
    const overPct = Math.round((wordPlan.swaOverRatio ?? 0) * 100);
    const trimRange = resolveSemrushTrimWordTargetRange(wordPlan.competitorWordCount);
    const protectedTerms = [
      ...(result.semrushRecommendedKeywords ?? []),
      ...(result.semrushMissingRecommendedKeywords ?? []),
      ...(result.semrushMissingTargetKeywords ?? []),
    ].slice(0, 10);
    const protectedHint =
      protectedTerms.length > 0
        ? `；**禁止删除**含以下词的句子：${protectedTerms.join('、')}`
        : '';
    lines.unshift(
      `[可读性·必做] SWA 统计约 ${wordPlan.effectiveCurrentWords} 词，超标约 ${overPct}%（标杆 ${wordPlan.competitorWordCount} 词，超过 ${Math.round(SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO * 100)}% 须删减）：压至 ${trimRange.min}–${trimRange.max} 词（标杆 +5%–+15%）${protectedHint}；**禁止加 FAQ/新段**`,
    );
  }

  const readability = result.semrushReadabilityScore;
  const currentFleschLooksTooPlain =
    typeof readability === 'number' &&
    readability > SEMRUSH_FLESCH_TARGET_DEFAULT + SEMRUSH_FLESCH_TOLERANCE;
  const fleschTarget = currentFleschLooksTooPlain
    ? SEMRUSH_FLESCH_TARGET_DEFAULT
    : resolveSemrushReadabilityTarget(readability);
  if (typeof readability === 'number') {
    const delta = Math.abs(readability - fleschTarget);
    if (delta > SEMRUSH_FLESCH_TOLERANCE) {
      lines.unshift(
        `[可读性] Semrush Flesch ${readability}，目标约 ${fleschTarget}（±${SEMRUSH_FLESCH_TOLERANCE}）：${readability > fleschTarget + SEMRUSH_FLESCH_TOLERANCE ? '文本偏浅显；合并短祈使句，增加专业术语、条件和因果解释' : '缩短句子、简化音节复杂词'}`,
      );
    }
  }

  const pointsToGo = Math.max(
    0,
    Math.round((SEMRUSH_PASS_THRESHOLD - result.overall) * 10) / 10,
  );
  if (pointsToGo > 0 && pointsToGo <= 0.2) {
    lines.unshift(
      `[Semrush·必做] Overall ${result.overall}/10，距 ${SEMRUSH_PASS_THRESHOLD} 仅差 ${pointsToGo}：逐项落实侧栏所有红点，优先拆段与语气`,
    );
  } else if (pointsToGo > 0) {
    lines.unshift(
      `[Semrush] Overall ${result.overall}/10，目标 ≥${SEMRUSH_PASS_THRESHOLD}：按侧栏建议逐项修改`,
    );
  }

  if (lines.length === 0) {
    lines.push(
      '[可读性] 拆分长段、简化句式、主动语态',
      '[语气] 重写随意句、删除填充词',
      '[SEO] 覆盖 SWA 推荐关键词',
    );
  }

  const capped = [...new Set(lines)].slice(0, SUGGESTION_CAP);
  if (!keywordWeaving) return capped;
  const withoutWeaving = capped.filter((line) => line !== keywordWeaving);
  return [keywordWeaving, ...withoutWeaving].slice(0, SUGGESTION_CAP);
}

/** 侧栏 suggestions 为空时的兜底指令（避免 optimize 轮提前 break） */
export function buildFallbackSemrushSuggestions(result: SeoScore, content: string): string[] {
  const primary = buildSemrushRewriteSuggestions(result, content);
  if (primary.length > 0) return primary;

  const audit = buildSemrushReadabilityAudit(content);
  const lines: string[] = [];
  const missing = [
    ...(result.semrushMissingTargetKeywords ?? []),
    ...(result.semrushMissingRecommendedKeywords ?? []),
  ];

  if (missing.length > 0) {
    const weaving = buildContextualKeywordWeavingInstruction(missing);
    if (weaving) lines.push(weaving);
  }

  if (audit.longParagraphCount > 0) {
    lines.push(
      `[可读性·必做] 拆分 ${audit.longParagraphCount} 个超长段（≤60 词/段，段间空行）`,
    );
  }
  if (audit.longSentenceCount > 2) {
    lines.push(`[可读性·必做] 将超长句从 ${audit.longSentenceCount} 条压到 ≤2 条（单句 ≤22 词）`);
  }

  const wordPlan = buildSemrushWordCountPlan({
    content,
    competitorWordCount: result.semrushCompetitorWordCount,
    apiReportedWords: result.semrushCurrentWordCount,
  });
  if (
    wordPlan.swaGap != null &&
    wordPlan.swaGap > OPTIMIZE_WORD_COUNT_EXPAND_GAP_THRESHOLD &&
    wordPlan.localExpandTarget != null
  ) {
    const faqCount = Math.min(4, Math.max(2, Math.ceil(wordPlan.localExpandGap / 50)));
    lines.push(
      `[可读性·必做] SWA 缺 ${wordPlan.swaGap} 词：本地扩写至 ${wordPlan.localExpandTarget} 词左右（${faqCount} 条 FAQ，每条 40–60 词）`,
    );
  }

  lines.push(
    '[格式·必做] 所有特性/要点须用 Markdown `-` 列表，禁止 "Item A - Item B - Item C" 行内串联',
    '[可读性] 优先主动语态；替换侧栏点名的 complex words',
  );

  return [...new Set(lines)].slice(0, SUGGESTION_CAP);
}

/** Semrush 优化后 boost 参数：60 词/3 句/段内列表化 */
export function buildSemrushBoostOptions(
  targetWordCount: number,
  surgical = false,
): BoostLocalSeoContentOptions {
  return {
    targetWordCount,
    maxParagraphWords: SEMRUSH_PARAGRAPH_MAX_WORDS,
    maxParagraphSentences: SEMRUSH_PARAGRAPH_MAX_SENTENCES,
    convertInlineLists: true,
    skipSentenceFix: surgical,
    skipWordCap: surgical,
  };
}

/** Semrush 优化后 boost 用的目标词数：优先本地扩写目标（略高于 SWA 标杆） */
export function resolveSemrushBoostWordTarget(
  semrushCompetitorWordCount: number | undefined,
  briefTargetWordCount: number,
  content?: string,
  semrushCurrentWordCount?: number,
): number {
  const briefTarget = resolveOptimizeWordCountTarget(
    briefTargetWordCount,
    semrushCompetitorWordCount,
  );
  if (!content?.trim() || semrushCompetitorWordCount == null) {
    return briefTarget;
  }
  const plan = buildSemrushWordCountPlan({
    content,
    competitorWordCount: semrushCompetitorWordCount,
    apiReportedWords: semrushCurrentWordCount,
  });
  return plan.localExpandTarget ?? briefTarget;
}
