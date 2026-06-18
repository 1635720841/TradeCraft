/**
 * Semrush 优化轮：建议合并、可读性诊断、提分计划（以 SWA Overall ≥9.0 为唯一目标）。
 */

import type { SeoScore } from '@wm/provider-interfaces';
import {
  extractLongParagraphs,
  extractLongSentences,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  SEMRUSH_PARAGRAPH_MAX_SENTENCES,
  SEMRUSH_PARAGRAPH_MAX_WORDS,
  type BoostLocalSeoContentOptions,
} from '@wm/shared-core';
import { SEMRUSH_PASS_THRESHOLD } from '../constants/seo-score';
import { buildContextualKeywordWeavingInstruction } from '../providers/semrush/semrush-keyword-coverage.util';

export { buildContextualKeywordWeavingInstruction };

const SUGGESTION_CAP = 28;

const PARAGRAPH_ISSUE_RE =
  /段落太长|拆分长段|paragraph.*too long|split.*paragraph|long paragraph/i;
const CASUAL_QUOTE_RE =
  /^[A-Za-z][^.!?]{8,280}[.!?]?$|^".+"$|^'.+'$/;

export function buildSemrushReadabilityAudit(content: string): {
  longSentenceCount: number;
  longParagraphCount: number;
  promptText: string;
} {
  const longSentences = extractLongSentences(content);
  const longParagraphs = extractLongParagraphs(content, SEMRUSH_PARAGRAPH_MAX_WORDS);

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
  readabilityAudit: string;
  pointsToGo: number;
  scoreGapPlan: string;
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

  const readabilityPriority =
    semrushResult.overall < SEMRUSH_PASS_THRESHOLD &&
    (hasSidebarIssues ||
      audit.longParagraphCount > 0 ||
      audit.longSentenceCount > 2 ||
      pointsToGo <= 0.2);

  return {
    readabilityPriority,
    readabilityAudit: audit.promptText,
    pointsToGo,
    scoreGapPlan: buildSemrushScoreGapPlan(semrushResult, pointsToGo),
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

  if (missingAll.length > 0) {
    const weaving = buildContextualKeywordWeavingInstruction(missingAll);
    if (weaving) lines.unshift(weaving);
  } else if (recommended.length > 0) {
    lines.unshift(
      `[SEO] SWA 推荐词须各至少出现 1 次（语境化融合，禁止列表堆砌）: ${recommended.slice(0, 10).join(', ')}`,
    );
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
        const weaving = buildContextualKeywordWeavingInstruction([term]);
        lines.unshift(weaving || `[SEO] 须自然融合: ${term}`);
      } else {
        lines.unshift(`[可读性·复杂词·必做] 替换词语: ${term}`);
      }
    }
  }

  const audit = buildSemrushReadabilityAudit(content);
  if (audit.longParagraphCount > 0) {
    for (const sample of extractLongParagraphs(content, SEMRUSH_PARAGRAPH_MAX_WORDS).slice(0, 3)) {
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
  const currentWords = result.semrushCurrentWordCount;
  if (
    typeof competitorWords === 'number' &&
    typeof currentWords === 'number' &&
    currentWords + 80 < competitorWords
  ) {
    const gap = competitorWords - currentWords;
    const faqCount = Math.min(4, Math.max(2, Math.ceil(gap / 50)));
    lines.unshift(
      `[可读性·必做] 当前约 ${currentWords} 词，Semrush 竞品标杆约 ${competitorWords} 词（缺 ${gap} 词）：增补至 ${competitorWords - 10}–${competitorWords} 词；优先加 ${faqCount} 条 FAQ（每条 40–60 词），禁止废话堆砌`,
    );
  }

  if (
    typeof competitorWords === 'number' &&
    typeof currentWords === 'number' &&
    currentWords > competitorWords + 30
  ) {
    lines.unshift(
      `[可读性] 当前约 ${currentWords} 词，Semrush 竞品标杆约 ${competitorWords} 词：须删减至 ${competitorWords}–${competitorWords + 50} 词`,
    );
  }

  const readability = result.semrushReadabilityScore;
  const fleschTarget = SEMRUSH_FLESCH_TARGET_DEFAULT;
  if (typeof readability === 'number') {
    const delta = Math.abs(readability - fleschTarget);
    if (delta > 8) {
      lines.unshift(
        `[可读性] Semrush Flesch ${readability}，目标约 ${fleschTarget}（±8）：${readability > fleschTarget ? '略增句长/正式词' : '缩短句子、简化音节复杂词'}`,
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

  return [...new Set(lines)].slice(0, SUGGESTION_CAP);
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

  const competitorWords = result.semrushCompetitorWordCount;
  const currentWords = result.semrushCurrentWordCount;
  if (
    typeof competitorWords === 'number' &&
    typeof currentWords === 'number' &&
    currentWords + 80 < competitorWords
  ) {
    const gap = competitorWords - currentWords;
    const faqCount = Math.min(4, Math.max(2, Math.ceil(gap / 50)));
    lines.push(
      `[可读性·必做] 缺 ${gap} 词：增补至 ${competitorWords} 词左右（${faqCount} 条 FAQ，每条 40–60 词）`,
    );
  }

  lines.push(
    '[格式·必做] 所有特性/要点须用 Markdown `-` 列表，禁止 "Item A - Item B - Item C" 行内串联',
    '[可读性] 优先主动语态；替换侧栏点名的 complex words',
  );

  return [...new Set(lines)].slice(0, SUGGESTION_CAP);
}

/** Semrush 优化后 boost 参数：60 词/3 句/段内列表化 */
export function buildSemrushBoostOptions(targetWordCount: number): BoostLocalSeoContentOptions {
  return {
    targetWordCount,
    maxParagraphWords: SEMRUSH_PARAGRAPH_MAX_WORDS,
    maxParagraphSentences: SEMRUSH_PARAGRAPH_MAX_SENTENCES,
    convertInlineLists: true,
  };
}

/** Semrush 优化后 boost 用的目标词数：优先竞品标杆，否则 Brief 目标 */
export function resolveSemrushBoostWordTarget(
  semrushCompetitorWordCount: number | undefined,
  briefTargetWordCount: number,
): number {
  if (typeof semrushCompetitorWordCount === 'number' && semrushCompetitorWordCount > 0) {
    return semrushCompetitorWordCount;
  }
  return briefTargetWordCount;
}
