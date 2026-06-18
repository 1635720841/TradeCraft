/**
 * 轻量级本地 SEO 预检：关键词/SERP 对齐 + 结构 + 可读性启发式（规则对齐 Semrush SWA）。
 *
 * 边界：
 * - 不负责：Semrush 终检（由 ISeoCheckerProvider 处理）；终检分以 Semrush 为准
 */

import { EN_STOPWORDS } from './stopwords-en';
import { extractLongSentences, extractLongParagraphs } from './readability-fix.util';
import {
  calculateFleschReadingEase,
  isFleschAlignedWithSemrush,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  SEMRUSH_FLESCH_TOLERANCE,
} from './flesch-readability.util';
import {
  detectSemrushCasualSentences,
  SEMRUSH_CASUAL_SENTENCE_HARD_MAX,
  SEMRUSH_CASUAL_SENTENCE_SOFT_MAX,
} from './semrush-tone.util';

export const LOCAL_SEO_PASS_THRESHOLD = 95;
/** 与 Semrush SWA 对齐：本地预检超长段阈值 */
export const LOCAL_PARAGRAPH_MAX_WORDS = 65;

export interface SerpOrganicSnippet {
  title?: string;
  snippet?: string;
}

export interface LocalSeoScoreInput {
  keyword: string;
  content: string;
  serpOrganic?: SerpOrganicSnippet[];
  targetWordCount?: number;
  /** Semrush SWA Flesch 目标（竞品均值，常见约 50） */
  readabilityTarget?: number;
  /** Semrush 竞品标杆词数（篇幅对齐优先于 brief targetWordCount） */
  competitorWordCount?: number;
}

export interface LocalSeoScoreBreakdown {
  keywordCoverage: number;
  serpTermAlignment: number;
  structure: number;
  /** 与 Semrush SWA 可读性规则对齐的启发式分 */
  readability: number;
  contentDepth: number;
}

export interface LocalSeoScoreResult {
  score: number;
  breakdown: LocalSeoScoreBreakdown;
  suggestions: string[];
  /** 正文尚未覆盖的 SERP 高频实体词，供 LLM 自然写入 */
  recommendedKeywords: string[];
  metrics: {
    wordCount: number;
    keywordDensity: number;
    matchedSerpTerms: number;
    totalSerpTerms: number;
    h2Count: number;
    /** 超过 22 词的长句数（与 Semrush / 优化 Prompt 一致） */
    longSentencesOver22: number;
    longParagraphsOver65: number;
    passiveVoiceHits: number;
    /** 超长句原文抽样，供 UI 定位与 LLM 定向改写 */
    longSentenceSamples?: Array<{ text: string; wordCount: number }>;
    /** 超长段原文抽样（>65 词/段） */
    longParagraphSamples?: Array<{ text: string; wordCount: number }>;
    /** Flesch Reading Ease（与 Semrush 侧栏同量纲） */
    fleschReadingEase?: number;
    fleschTarget?: number;
    /** Semrush 语气：随意句命中数 */
    casualSentenceHits?: number;
    /** 随意句原文抽样（供 UI 与 LLM 定向改写） */
    casualSentenceSamples?: Array<{ text: string; reason: string }>;
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !EN_STOPWORDS.has(w));
}

function countPhrase(text: string, phrase: string): number {
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

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.trim().length > 0).length;
}

function countH2(text: string): number {
  return (text.match(/^##\s+/gm) ?? []).length;
}

function hasListItems(text: string): boolean {
  return /^-\s+/m.test(text);
}

interface WeightedTerm {
  term: string;
  tf: number;
  df: number;
  idf: number;
}

function extractSerpTerms(organic: SerpOrganicSnippet[], keyword: string): WeightedTerm[] {
  const keywordTokens = new Set(tokenize(keyword));
  const docCount = Math.max(organic.length, 1);
  const tfMap = new Map<string, number>();
  const dfMap = new Map<string, number>();

  for (const item of organic) {
    const titleTokens = tokenize(item.title ?? '');
    const snippetTokens = tokenize(item.snippet ?? '');
    const docTerms = new Set<string>();

    for (const t of titleTokens) {
      if (keywordTokens.has(t)) continue;
      tfMap.set(t, (tfMap.get(t) ?? 0) + 2);
      docTerms.add(t);
    }
    for (const t of snippetTokens) {
      if (keywordTokens.has(t)) continue;
      tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
      docTerms.add(t);
    }
    for (const t of docTerms) {
      dfMap.set(t, (dfMap.get(t) ?? 0) + 1);
    }
  }

  const terms: WeightedTerm[] = [];
  for (const [term, tf] of tfMap) {
    const df = dfMap.get(term) ?? 1;
    const idf = Math.log((docCount + 1) / (df + 1)) + 1;
    terms.push({ term, tf, df, idf });
  }

  return terms
    .sort((a, b) => b.tf * b.idf - a.tf * a.idf)
    .slice(0, 20);
}

function scoreKeywordCoverage(keyword: string, content: string): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 0;
  const wordCount = Math.max(countWords(content), 1);
  const keywordHits = countPhrase(content, keyword);
  const density = (keywordHits * keyword.split(/\s+/).length) / wordCount;

  if (content.slice(0, 200).toLowerCase().includes(keyword.toLowerCase())) {
    score += 7;
  } else {
    suggestions.push('在正文开头前 200 个字符内自然出现目标关键词（完整短语）');
  }

  if (density >= 0.008 && density <= 0.025) {
    score += 10;
  } else if (density >= 0.004 && density <= 0.035) {
    score += 6;
    suggestions.push('调整关键词密度至约 0.8%–2.5%');
  } else {
    suggestions.push('关键词出现过少或堆砌，请调整密度至约 0.8%–2.5%');
  }

  const h2Lines = content.match(/^##\s+.+$/gm) ?? [];
  const keywordInHeading = h2Lines.some((line) =>
    line.toLowerCase().includes(keyword.toLowerCase()),
  );
  if (keywordInHeading) {
    score += 8;
  } else {
    suggestions.push('至少在一个 H2 标题中包含目标关键词');
  }

  return { score: Math.min(score, 25), suggestions };
}

function scoreSerpAlignment(
  content: string,
  serpTerms: WeightedTerm[],
): {
  score: number;
  matched: number;
  total: number;
  suggestions: string[];
  recommendedKeywords: string[];
} {
  if (serpTerms.length === 0) {
    return { score: 20, matched: 0, total: 0, suggestions: [], recommendedKeywords: [] };
  }

  const draftTokens = new Set(tokenize(content));
  const contentLower = content.toLowerCase();
  let weightedHit = 0;
  let weightedTotal = 0;
  const missing: string[] = [];

  for (const { term, idf } of serpTerms) {
    const weight = idf;
    weightedTotal += weight;
    const hit = draftTokens.has(term) || contentLower.includes(term);
    if (hit) {
      weightedHit += weight;
    } else if (missing.length < 12) {
      missing.push(term);
    }
  }

  const ratio = weightedTotal > 0 ? weightedHit / weightedTotal : 0;
  const score = Math.round(ratio * 25);
  const suggestions =
    missing.length > 0
      ? [`补充 SERP 高频实体词：${missing.join('、')}`]
      : [];

  return {
    score,
    matched: serpTerms.filter(
      (t) => draftTokens.has(t.term) || contentLower.includes(t.term),
    ).length,
    total: serpTerms.length,
    suggestions,
    recommendedKeywords: missing,
  };
}

function scoreStructure(
  content: string,
  targetWordCount: number,
  competitorWordCount?: number,
): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 0;
  const h2Count = countH2(content);
  const wordCount = countWords(content);

  if (h2Count >= 4) {
    score += 8;
  } else {
    suggestions.push('增加 H2 章节至至少 4 个');
  }

  const lengthTarget =
    typeof competitorWordCount === 'number' && competitorWordCount > 0
      ? competitorWordCount
      : targetWordCount;

  if (typeof competitorWordCount === 'number' && competitorWordCount > 0) {
    const gap = competitorWordCount - wordCount;
    if (gap > 80) {
      score += 4;
      suggestions.push(
        `距 Semrush 竞品篇幅缺约 ${gap} 词（当前 ${wordCount}，标杆约 ${competitorWordCount}）`,
      );
    } else if (gap > 30) {
      score += 6;
      suggestions.push(
        `略低于 Semrush 竞品篇幅（当前 ${wordCount}，标杆约 ${competitorWordCount}）`,
      );
    } else if (wordCount > competitorWordCount + 50) {
      suggestions.push(
        `正文偏长（约 ${wordCount} 词），Semrush 竞品标杆约 ${competitorWordCount} 词`,
      );
      score += 4;
    } else {
      score += 8;
    }
  } else {
    const ratio = wordCount / Math.max(lengthTarget, 1);
    if (ratio >= 0.7 && ratio <= 1.05) {
      score += 8;
    } else if (ratio > 1.05 && ratio <= 1.15) {
      score += 4;
      suggestions.push(
        `正文偏长（约 ${wordCount} 词），Semrush 建议控制在目标 ${lengthTarget} 词的 105% 以内`,
      );
    } else if (ratio > 1.15) {
      suggestions.push(
        `正文过长（约 ${wordCount} 词），须删减以符合 Semrush 竞品长度（目标约 ${lengthTarget} 词）`,
      );
    } else if (ratio >= 0.5) {
      score += 4;
      suggestions.push(`正文篇幅偏短（当前约 ${wordCount} 词，目标 ${lengthTarget}）`);
    } else {
      suggestions.push(`正文过短（当前约 ${wordCount} 词，目标 ${lengthTarget}）`);
    }
  }

  if (hasListItems(content)) {
    score += 4;
  } else {
    suggestions.push('适当使用列表提升可读性与结构得分');
  }

  return { score: Math.min(score, 20), suggestions };
}

/** 启发式可读性分，规则与 Semrush SWA 侧栏一致（长句阈值 22 词） */
function scoreReadability(
  content: string,
  readabilityTarget: number = SEMRUSH_FLESCH_TARGET_DEFAULT,
): {
  score: number;
  suggestions: string[];
  longSentencesOver22: number;
  longParagraphsOver65: number;
  passiveVoiceHits: number;
  fleschReadingEase: number;
  casualSentenceHits: number;
  casualSentenceSamples: Array<{ text: string; reason: string }>;
} {
  const suggestions: string[] = [];
  let score = 20;

  const bodyParagraphs = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('#') && !p.startsWith('![') && !/^-\s+/.test(p));

  let longParagraphsOver65 = 0;
  for (const paragraph of bodyParagraphs) {
    if (countWords(paragraph) > LOCAL_PARAGRAPH_MAX_WORDS) longParagraphsOver65 += 1;
  }
  if (longParagraphsOver65 > 1) {
    score -= 4;
    suggestions.push(`拆分长段（Semrush 可读性：单段建议不超过约 ${LOCAL_PARAGRAPH_MAX_WORDS} 词）`);
  }

  const sentences = content.split(/[.!?]+/).filter((s) => countWords(s) >= 4);
  let longSentencesOver22 = 0;
  for (const sentence of sentences) {
    if (countWords(sentence) > 22) longSentencesOver22 += 1;
  }
  if (longSentencesOver22 > 2) {
    score -= 4;
    suggestions.push('重写难以阅读的句子（Semrush：单句建议 ≤22 词）');
  }

  const passiveMatches = content.match(/\b(is|are|was|were|been|being)\s+\w+ed\b/gi) ?? [];
  const passiveVoiceHits = passiveMatches.length;
  if (passiveVoiceHits > 6) {
    score -= 2;
    suggestions.push('考虑使用主动语态（减少被动句）');
  }

  if (/\bit is\b/i.test(content) || /\bthere (is|are)\b/i.test(content)) {
    score -= 1;
    suggestions.push('删除 it is / there is 等填充词');
  }

  const complexWordHits = (
    content.match(
      /\b(utilize|utilise|facilitate|commence|aforementioned|leverage|in order to|due to the fact that|overtemperature)\b/gi,
    ) ?? []
  ).length;
  if (complexWordHits > 2) {
    score -= 2;
    suggestions.push('替换太过复杂的词语（用 use/help/start 等常用词）');
  }

  const fleschReadingEase = calculateFleschReadingEase(content);
  if (
    !isFleschAlignedWithSemrush(
      fleschReadingEase,
      readabilityTarget,
      SEMRUSH_FLESCH_TOLERANCE,
    )
  ) {
    const delta = fleschReadingEase - readabilityTarget;
    score -= 3;
    if (delta > SEMRUSH_FLESCH_TOLERANCE) {
      suggestions.push(
        `Flesch 可读性 ${fleschReadingEase} 偏易（Semrush 目标约 ${readabilityTarget}）：略增句长或用更正式词`,
      );
    } else {
      suggestions.push(
        `Flesch 可读性 ${fleschReadingEase} 偏难（Semrush 目标约 ${readabilityTarget}）：缩短句子、减少音节复杂词`,
      );
    }
  }

  const casualSentenceMatches = detectSemrushCasualSentences(content);
  const casualSentenceHits = casualSentenceMatches.length;
  if (casualSentenceHits > SEMRUSH_CASUAL_SENTENCE_HARD_MAX) {
    score -= 4;
    suggestions.push(
      `语气偏随意（${casualSentenceHits} 处）：将 RFQ 问句、Next/Can users 等改为 B2B 正式表述`,
    );
  } else if (casualSentenceHits > SEMRUSH_CASUAL_SENTENCE_SOFT_MAX) {
    score -= 2;
    suggestions.push(`语气略随意（${casualSentenceHits} 处随意句），对齐 Semrush「有点正式」`);
  }

  if (score < 14 && suggestions.length === 0) {
    suggestions.push('简化全文表述，降低阅读复杂度');
  }

  return {
    score: Math.max(0, Math.min(score, 20)),
    suggestions,
    longSentencesOver22,
    longParagraphsOver65,
    passiveVoiceHits,
    fleschReadingEase,
    casualSentenceHits,
    casualSentenceSamples: casualSentenceMatches.slice(0, 8),
  };
}

function scoreContentDepth(content: string): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 0;
  const wordCount = countWords(content);
  const uniqueTerms = new Set(tokenize(content)).size;

  if (wordCount >= 700) score += 4;
  else suggestions.push('正文建议不少于 700 词');

  if (uniqueTerms >= 100) score += 6;
  else suggestions.push('补充术语与实体词覆盖（用短句表达，勿为凑词数写长段）');

  return { score: Math.min(score, 10), suggestions };
}

const DIMENSION_MAX: Record<keyof LocalSeoScoreBreakdown, number> = {
  keywordCoverage: 25,
  serpTermAlignment: 25,
  structure: 20,
  readability: 20,
  contentDepth: 10,
};

/** 生成「还差 X 分」的逐项提分计划，供 LLM 精确对症 */
export function buildLocalScoreGapPlan(
  result: LocalSeoScoreResult,
  targetScore: number = LOCAL_SEO_PASS_THRESHOLD,
): string {
  const gap = targetScore - result.score;
  if (gap <= 0) {
    return `Already at ${result.score}/100 (target ${targetScore}).`;
  }

  const lines = [
    `**Need +${gap} point(s)** to reach ${targetScore}/100 (current ${result.score}/100).`,
    '',
    'Dimension gaps (fix smallest-cost items first):',
  ];

  const dims = (Object.keys(DIMENSION_MAX) as Array<keyof LocalSeoScoreBreakdown>)
    .map((key) => ({
      key,
      score: result.breakdown[key],
      max: DIMENSION_MAX[key],
      gap: DIMENSION_MAX[key] - result.breakdown[key],
    }))
    .filter((d) => d.gap > 0)
    .sort((a, b) => a.gap - b.gap);

  for (const d of dims) {
    lines.push(`- ${d.key}: ${d.score}/${d.max} (−${d.gap} pts)`);
  }

  const m = result.metrics;
  lines.push('', 'Scorer-aligned readability counters (must match after edit):');
  lines.push(
    `- Sentences **>22 words**: ${m.longSentencesOver22} (max **2** allowed — each excess blocks +6 readability pts)`,
  );
  lines.push(
    `- Paragraphs **>${LOCAL_PARAGRAPH_MAX_WORDS} words**: ${m.longParagraphsOver65} (max **1** allowed — excess blocks readability pts)`,
  );
  lines.push(
    `- Passive voice hits: ${m.passiveVoiceHits} (max **6** allowed — excess blocks readability pts)`,
  );
  if (typeof m.fleschReadingEase === 'number') {
    lines.push(
      `- Flesch readability: **${m.fleschReadingEase}** (Semrush target **${m.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT}**, ±${SEMRUSH_FLESCH_TOLERANCE})`,
    );
  }
  if (typeof m.casualSentenceHits === 'number') {
    lines.push(
      `- Casual tone hits: **${m.casualSentenceHits}** (max **${SEMRUSH_CASUAL_SENTENCE_SOFT_MAX}** soft / **${SEMRUSH_CASUAL_SENTENCE_HARD_MAX}** hard)`,
    );
  }

  if (gap === 1) {
    lines.push(
      '',
      '**+1 point mode**: Make ONE scorer-visible fix (split 1 long sentence to ≤22 words, OR remove 1 passive, OR add 1 bullet list if structure −4). Do NOT add new paragraphs or SERP filler sentences.',
    );
  }

  return lines.join('\n');
}

/** 计算 0–100 本地 SEO 分 */
export function scoreLocalSeo(input: LocalSeoScoreInput): LocalSeoScoreResult {
  const content = input.content ?? '';
  const keyword = input.keyword.trim();
  const targetWordCount = input.targetWordCount ?? 1500;
  const readabilityTarget = input.readabilityTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT;
  const serpTerms = extractSerpTerms(input.serpOrganic ?? [], keyword);

  const keywordPart = scoreKeywordCoverage(keyword, content);
  const serpPart = scoreSerpAlignment(content, serpTerms);
  const structurePart = scoreStructure(content, targetWordCount, input.competitorWordCount);
  const readabilityPart = scoreReadability(content, readabilityTarget);
  const depthPart = scoreContentDepth(content);

  const breakdown: LocalSeoScoreBreakdown = {
    keywordCoverage: keywordPart.score,
    serpTermAlignment: serpPart.score,
    structure: structurePart.score,
    readability: readabilityPart.score,
    contentDepth: depthPart.score,
  };

  const score =
    breakdown.keywordCoverage +
    breakdown.serpTermAlignment +
    breakdown.structure +
    breakdown.readability +
    breakdown.contentDepth;

  const suggestions = [
    ...readabilityPart.suggestions,
    ...structurePart.suggestions,
    ...keywordPart.suggestions,
    ...serpPart.suggestions,
    ...depthPart.suggestions,
  ].slice(0, 8);

  const wordCount = countWords(content);
  const keywordHits = countPhrase(content, keyword);
  const keywordDensity = (keywordHits * keyword.split(/\s+/).length) / Math.max(wordCount, 1);

  const longSentenceSamples = extractLongSentences(content).slice(0, 8);
  const longParagraphSamples = extractLongParagraphs(content, LOCAL_PARAGRAPH_MAX_WORDS).slice(0, 6);

  return {
    score,
    breakdown,
    suggestions,
    recommendedKeywords: serpPart.recommendedKeywords,
    metrics: {
      wordCount,
      keywordDensity: Math.round(keywordDensity * 10000) / 100,
      matchedSerpTerms: serpPart.matched,
      totalSerpTerms: serpPart.total,
      h2Count: countH2(content),
      longSentencesOver22: readabilityPart.longSentencesOver22,
      longParagraphsOver65: readabilityPart.longParagraphsOver65,
      passiveVoiceHits: readabilityPart.passiveVoiceHits,
      fleschReadingEase: readabilityPart.fleschReadingEase,
      fleschTarget: readabilityTarget,
      casualSentenceHits: readabilityPart.casualSentenceHits,
      longSentenceSamples: longSentenceSamples.length > 0 ? longSentenceSamples : undefined,
      longParagraphSamples: longParagraphSamples.length > 0 ? longParagraphSamples : undefined,
    },
  };
}
