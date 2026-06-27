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
import {
  computeSemrushWordCountOverRatio,
  detectHardToReadSentences,
  detectSemrushComplexWordSamples,
  inferSemrushWordCountTarget,
  isSemrushWordCountOverTarget,
  SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO,
  SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO,
  SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO,
  resolveSemrushTrimWordTargetRange,
} from './semrush-readability-align.util';
import { isSemrushKeywordPresentInContent } from './semrush-keyword-match.util';
import {
  analyzeSemrushTitleTargetKeywordIssues,
} from './semrush-title-keyword-rule.util';
import { countSemanticSectionHeadings } from './article-score-content.util';

export const LOCAL_SEO_PASS_THRESHOLD = 95;
/** 与 Semrush SWA 对齐：本地预检超长段阈值 */
export const LOCAL_PARAGRAPH_MAX_WORDS = 65;
/** 本地评分规则版本：训练快照必须同版本，避免规则变更后标签混用。 */
export const LOCAL_SEO_SCORE_VERSION = 2 as const;

export interface SerpOrganicSnippet {
  title?: string;
  snippet?: string;
}

export interface LocalSeoScoreInput {
  keyword: string;
  /** Semrush SWA 提交的全部目标词（多 Tag）；缺省仅评 keyword */
  submittedKeywords?: string[];
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
    /** Semrush 复杂词命中数 */
    semrushComplexWordHits?: number;
    semrushComplexWordSamples?: Array<{ term: string; suggestion: string }>;
    /** Semrush「难以阅读」句命中数 */
    hardToReadSentenceHits?: number;
    hardToReadSentenceSamples?: Array<{ text: string; wordCount: number; reasons: string[] }>;
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

function normalizeHeadingToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === 'feet') return 'foot';
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('ing') && lower.length > 5) return lower.slice(0, -3);
  if (lower.endsWith('ed') && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/** 标题内允许词序变化、介词插入与常见词形变化，避免强迫 exact-match 标题。 */
export function headingMatchesKeyword(heading: string, keyword: string): boolean {
  const headingTokens = new Set(tokenize(heading).map(normalizeHeadingToken));
  const keywordTokens = [...new Set(tokenize(keyword).map(normalizeHeadingToken))];
  if (keywordTokens.length === 0) return false;
  const matched = keywordTokens.filter((token) => headingTokens.has(token)).length;
  const required = keywordTokens.length >= 3 ? Math.ceil(keywordTokens.length * 0.6) : keywordTokens.length;
  return matched >= required;
}

function hasListItems(text: string): boolean {
  if (/^-\s+/m.test(text)) return true;
  // Semrush plain text 枚举块（including: / exercises include: 后多行短语）
  return /:\s*\n\n[A-Z][^\n]{2,80}(\n[A-Z][^\n]{2,80}){2,}/m.test(text);
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
  const keywordLower = keyword.toLowerCase().trim();
  if (!keywordLower) {
    return { score: 0, suggestions: ['请填写目标关键词'] };
  }

  const present = isSemrushKeywordPresentInContent(content, keyword);
  if (!present) {
    suggestions.push('目标关键词尚未写入正文（Semrush Tag 仍为灰）');
    return { score: 2, suggestions };
  }

  // SWA Tag 变绿：基础分（对齐 SEO 维度 ≥8.5/10）
  let score = 21;
  const wordCount = Math.max(countWords(content), 1);
  const keywordHits = countPhrase(content, keyword);
  const keywordWordCount = keyword.split(/\s+/).filter(Boolean).length;
  const density = (keywordHits * keywordWordCount) / wordCount;
  const firstHeading = content.match(/^#{1,3}\s+.+$/m)?.[0]?.toLowerCase() ?? '';
  const opening = content.slice(0, 200).toLowerCase();

  if (
    opening.includes(keywordLower) ||
    firstHeading.includes(keywordLower) ||
    headingMatchesKeyword(firstHeading, keyword)
  ) {
    score += 2;
  } else {
    suggestions.push('可在正文开头或主标题中再自然出现一次目标词');
  }

  if (keywordWordCount >= 4 && keywordHits >= 1) {
    score += 2;
  } else if (keywordWordCount === 3 && (keywordHits >= 1 || density >= 0.003)) {
    score += 2;
  } else if (density >= 0.008 && density <= 0.025) {
    score += 2;
  } else if (density >= 0.004 && density <= 0.035) {
    score += 1;
    suggestions.push('调整关键词密度至约 0.8%–2.5% 可更接近 Semrush');
  } else if (density < 0.004) {
    suggestions.push('长文可适当再自然提及 1 次目标词（Semrush 密度建议 0.8%–2.5%）');
  } else {
    suggestions.push('关键词密度偏高，请调整至约 0.8%–2.5%');
  }

  return { score: Math.min(score, 25), suggestions };
}

function mergeKeywordLists(primary: string, extra?: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const item of [primary, ...(extra ?? [])]) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

/** 多目标词：各词独立计分后取平均（对齐 SWA 多 Tag） */
function scoreKeywordCoverageList(keywords: string[], content: string): { score: number; suggestions: string[] } {
  if (keywords.length === 0) {
    return { score: 0, suggestions: ['请填写至少一个目标关键词'] };
  }

  let total = 0;
  const suggestions: string[] = [];
  for (const keyword of keywords) {
    const part = scoreKeywordCoverage(keyword, content);
    total += part.score;
    suggestions.push(...part.suggestions);
  }

  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const titleIssues = analyzeSemrushTitleTargetKeywordIssues(h1, keywords);
  let scoreDelta = 0;
  if (titleIssues.some((issue) => issue.code === 'no_target_keyword_in_title')) {
    scoreDelta -= 4;
  } else if (titleIssues.some((issue) => issue.code === 'target_keyword_repeated_in_title')) {
    scoreDelta -= 3;
  }
  for (const issue of titleIssues) {
    if (!suggestions.includes(issue.message)) {
      suggestions.push(issue.message);
    }
  }

  const averaged = keywords.length === 1 ? total : Math.round(total / keywords.length);

  return {
    score: Math.min(Math.max(0, averaged + scoreDelta), 25),
    suggestions: [...new Set(suggestions)],
  };
}

/** 关键词密度次档时，在首段自然补 1 次完整短语（确定性 +4 分路径） */
export function applyKeywordDensityNudge(keyword: string, content: string): string {
  const trimmed = keyword.trim();
  if (!trimmed) return content;

  const wordCount = Math.max(countWords(content), 1);
  const hits = countPhrase(content, trimmed);
  const kwWords = trimmed.split(/\s+/).filter(Boolean).length;
  const density = (hits * kwWords) / wordCount;

  if (kwWords >= 4 && hits >= 1) return content;
  if (density >= 0.005 && density <= 0.025) return content;
  if (density < 0.005) {
    const lines = content.split('\n');
    let targetIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('![') || /^-\s+/.test(line)) continue;
      targetIdx = i;
      break;
    }
    if (targetIdx < 0) return content;
    const weave = `Teams evaluating ${trimmed} should weigh compatibility, safety limits, and field service needs together.`;
    lines[targetIdx] = `${lines[targetIdx].trim()} ${weave}`;
    return lines.join('\n');
  }
  return content;
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
    return {
      score: 15,
      matched: 0,
      total: 0,
      suggestions: ['无 SERP 实体词可对照；跑 SERP 分析后重评可提高 Semrush 对齐准确度'],
      recommendedKeywords: [],
    };
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
  const sectionCount = countSemanticSectionHeadings(content);
  const h2Count = countH2(content);
  const wordCount = countWords(content);

  if (sectionCount >= 4 || h2Count >= 4) {
    score += 8;
  } else {
    suggestions.push('增加章节标题至至少 4 个（H2 或 Module 小节）');
  }

  const lengthTarget =
    typeof competitorWordCount === 'number' && competitorWordCount > 0
      ? competitorWordCount
      : targetWordCount > 0
        ? targetWordCount
        : inferSemrushWordCountTarget(wordCount);

  if (typeof competitorWordCount === 'number' && competitorWordCount > 0) {
    const gap = competitorWordCount - wordCount;
    const writeTarget = Math.round(
      competitorWordCount * (1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO),
    );
    const softMax = Math.round(competitorWordCount * (1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO));
    if (gap > 30) {
      score += gap > 100 ? 4 : 6;
      suggestions.push(
        gap > 100
          ? `距 Semrush 竞品篇幅缺约 ${gap} 词（当前 ${wordCount}，标杆约 ${competitorWordCount}）`
          : `略低于 Semrush 竞品篇幅（当前 ${wordCount}，标杆约 ${competitorWordCount}，宜扩写至约 ${writeTarget} 词）`,
      );
    } else if (isSemrushWordCountOverTarget(wordCount, competitorWordCount)) {
      const overPct = Math.round((computeSemrushWordCountOverRatio(wordCount, competitorWordCount) ?? 0) * 100);
      const trimRange = resolveSemrushTrimWordTargetRange(competitorWordCount);
      suggestions.push(
        `正文超标约 ${overPct}%（当前 ${wordCount} 词，标杆约 ${competitorWordCount} 词，超过 ${Math.round(SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO * 100)}% 须删减至 ${trimRange.min}–${trimRange.max} 词）`,
      );
      score += overPct > 30 ? 2 : 4;
    } else if (wordCount >= writeTarget && wordCount <= softMax) {
      score += 8;
    } else if (wordCount >= competitorWordCount) {
      score += 6;
      if (wordCount < writeTarget) {
        suggestions.push(
          `正文可再略扩（当前 ${wordCount} 词，建议写至约 ${writeTarget} 词，即标杆 +5%）`,
        );
      }
    } else {
      score += 6;
      suggestions.push(
        `正文略低于标杆（当前 ${wordCount} 词，建议写至约 ${writeTarget} 词）`,
      );
    }
  } else {
    const ratio = wordCount / Math.max(lengthTarget, 1);
    if (ratio >= 1 && ratio <= 1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO) {
      score += 8;
    } else if (ratio >= 0.95 && ratio < 1) {
      score += 6;
      suggestions.push(
        `正文略低于目标（当前约 ${wordCount} 词，建议写至目标的 ${Math.round((1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO) * 100)}% 即约 ${Math.round(lengthTarget * (1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO))} 词）`,
      );
    } else if (ratio > 1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO && ratio <= 1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO) {
      score += 8;
    } else if (ratio > 1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO && ratio <= 1 + SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO) {
      score += 4;
      suggestions.push(
        `正文偏长（约 ${wordCount} 词），建议控制在目标 ${lengthTarget} 词的 ${Math.round((1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO) * 100)}%–${Math.round((1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO) * 100)}%`,
      );
    } else if (ratio > 1 + SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO) {
      suggestions.push(
        `正文较长（约 ${wordCount} 词），Semrush 竞品标杆约 ${lengthTarget} 词；可在侧栏填入标杆词数后重评`,
      );
      score += h2Count >= 4 || sectionCount >= 4 ? 4 : 2;
    } else if (ratio >= 0.5) {
      score += 4;
      suggestions.push(`正文篇幅偏短（当前约 ${wordCount} 词，目标 ${lengthTarget}）`);
    } else {
      suggestions.push(`正文过短（当前约 ${wordCount} 词，目标 ${lengthTarget}）`);
    }
  }

  if (hasListItems(content) || sectionCount >= 8) {
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
  semrushComplexWordHits: number;
  semrushComplexWordSamples: Array<{ term: string; suggestion: string }>;
  hardToReadSentenceHits: number;
  hardToReadSentenceSamples: Array<{ text: string; wordCount: number; reasons: string[] }>;
} {
  const suggestions: string[] = [];

  const longParagraphsOver65 = extractLongParagraphs(
    content,
    LOCAL_PARAGRAPH_MAX_WORDS,
  ).length;

  // 与样本一致：Markdown 感知切句，避免列表/图片占位被误判为整句超长句
  const longSentencesOver22 = extractLongSentences(content).length;

  const passiveMatches = content.match(/\b(is|are|was|were|been|being)\s+\w+ed\b/gi) ?? [];
  const passiveVoiceHits = passiveMatches.length;

  const semrushComplexWordSamples = detectSemrushComplexWordSamples(content);
  const semrushComplexWordHits = semrushComplexWordSamples.length;

  const hardToReadSentenceSamples = detectHardToReadSentences(content);
  const hardToReadSentenceHits = hardToReadSentenceSamples.length;

  const fleschReadingEase = calculateFleschReadingEase(content);
  const fleschAligned = isFleschAlignedWithSemrush(
    fleschReadingEase,
    readabilityTarget,
    SEMRUSH_FLESCH_TOLERANCE,
  );

  const casualSentenceMatches = detectSemrushCasualSentences(content);
  const casualSentenceHits = casualSentenceMatches.length;

  /** Semrush SWA 可读性轴 0–10：侧栏仍有红项时 Overall 仍可 ≥9 */
  let swaReadability = 10;

  if (longParagraphsOver65 > 1) {
    swaReadability -= 0.6;
    suggestions.push(`拆分长段（Semrush 可读性：单段建议不超过约 ${LOCAL_PARAGRAPH_MAX_WORDS} 词）`);
  }
  if (longSentencesOver22 > 2) {
    swaReadability -= Math.min(1.2, (longSentencesOver22 - 2) * 0.08);
    suggestions.push('重写难以阅读的句子（Semrush：单句建议 ≤22 词）');
  }
  if (passiveVoiceHits > 6) {
    swaReadability -= 0.4;
    suggestions.push('考虑使用主动语态（减少被动句）');
  }
  if (/\bit is\b/i.test(content) || /\bthere (is|are)\b/i.test(content)) {
    swaReadability -= 0.2;
    suggestions.push('删除 it is / there is 等填充词');
  }
  if (semrushComplexWordHits > 0) {
    swaReadability -= Math.min(1.2, semrushComplexWordHits * 0.25);
    suggestions.push(
      `替换 Semrush 复杂词（${semrushComplexWordHits} 处）：${semrushComplexWordSamples
        .slice(0, 4)
        .map((s) => `${s.term}→${s.suggestion}`)
        .join('、')}`,
    );
  }
  if (hardToReadSentenceHits > 2) {
    swaReadability -= Math.min(1.8, (hardToReadSentenceHits - 2) * 0.035);
    suggestions.push(
      `重写难以阅读的句子（${hardToReadSentenceHits} 处）：拆分长句、减少 and/or 并列`,
    );
  } else if (hardToReadSentenceHits > 0) {
    swaReadability -= 0.4;
    suggestions.push(`优化难读句（${hardToReadSentenceHits} 处），对齐 Semrush 侧栏`);
  }
  if (!fleschAligned) {
    const delta = Math.abs(fleschReadingEase - readabilityTarget);
    swaReadability -= fleschReadingEase < readabilityTarget - SEMRUSH_FLESCH_TOLERANCE && delta > 20 ? 0.5 : 0.35;
    if (fleschReadingEase > readabilityTarget + SEMRUSH_FLESCH_TOLERANCE) {
      suggestions.push(
        `Flesch 可读性 ${fleschReadingEase} 偏易（Semrush 目标约 ${readabilityTarget}）：略增句长或用更正式词`,
      );
    } else {
      suggestions.push(
        `Flesch 可读性 ${fleschReadingEase} 偏难（Semrush 目标约 ${readabilityTarget}）：缩短句子、减少音节复杂词`,
      );
    }
  }
  if (casualSentenceHits > SEMRUSH_CASUAL_SENTENCE_HARD_MAX) {
    swaReadability -= 0.8;
    suggestions.push(
      `语气偏随意（${casualSentenceHits} 处）：将 RFQ 问句、Next/Can users 等改为 B2B 正式表述`,
    );
  } else if (casualSentenceHits > SEMRUSH_CASUAL_SENTENCE_SOFT_MAX) {
    swaReadability -= 0.4;
    suggestions.push(`语气略随意（${casualSentenceHits} 处随意句），对齐 Semrush「有点正式」`);
  }

  swaReadability = Math.max(5, Math.min(10, swaReadability));

  const semrushReadabilityReady =
    semrushComplexWordHits === 0 &&
    casualSentenceHits <= SEMRUSH_CASUAL_SENTENCE_SOFT_MAX &&
    hardToReadSentenceHits <= 2 &&
    longSentencesOver22 <= 2 &&
    longParagraphsOver65 <= 1 &&
    fleschAligned;

  let score = Math.round((swaReadability / 10) * 20);
  if (!semrushReadabilityReady) {
    const readinessCap = longParagraphsOver65 > 1 ? 15 : 16;
    score = Math.min(score, readinessCap);
    if (score >= 16 && suggestions.length < 6) {
      suggestions.push(
        'Semrush 可读性未齐：须清零复杂词/随意句/难读句，长句≤2、长段≤1，Flesch 对齐目标后再拿满分',
      );
    }
  }
  if (swaReadability < 9.5) {
    score = Math.min(score, Math.round((swaReadability / 10) * 20));
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
    semrushComplexWordHits,
    semrushComplexWordSamples: semrushComplexWordSamples.slice(0, 8),
    hardToReadSentenceHits,
    hardToReadSentenceSamples: hardToReadSentenceSamples.slice(0, 6),
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
  lines.push(
    '',
    'Scorer-aligned readability gate (clear ALL items to unlock readability 17–20; any unresolved item caps readability at 16, and >1 long paragraph caps it at 15):',
  );
  lines.push(
    `- Sentences **>22 words**: ${m.longSentencesOver22} (must be **≤2**)`,
  );
  lines.push(
    `- Paragraphs **>${LOCAL_PARAGRAPH_MAX_WORDS} words**: ${m.longParagraphsOver65} (must be **≤1**)`,
  );
  lines.push(
    `- Passive voice hits: ${m.passiveVoiceHits} (keep **≤6**)`,
  );
  if (typeof m.fleschReadingEase === 'number') {
    lines.push(
      `- Flesch readability: **${m.fleschReadingEase}** (align to Semrush target **${m.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT}** within ±${SEMRUSH_FLESCH_TOLERANCE} to pass the gate)`,
    );
  }
  if (typeof m.casualSentenceHits === 'number') {
    lines.push(
      `- Casual tone hits: **${m.casualSentenceHits}** (max **${SEMRUSH_CASUAL_SENTENCE_SOFT_MAX}** soft / **${SEMRUSH_CASUAL_SENTENCE_HARD_MAX}** hard)`,
    );
  }
  if (typeof m.semrushComplexWordHits === 'number' && m.semrushComplexWordHits > 0) {
    lines.push(
      `- Semrush complex words: **${m.semrushComplexWordHits}** (must be **0** to pass the readability gate — replace with simpler terms)`,
    );
  }
  if (typeof m.hardToReadSentenceHits === 'number' && m.hardToReadSentenceHits > 0) {
    lines.push(
      `- Hard-to-read sentences: **${m.hardToReadSentenceHits}** (max **2** allowed — split long/multi-clause sentences)`,
    );
  }
  if (result.breakdown.keywordCoverage < DIMENSION_MAX.keywordCoverage) {
    if (typeof m.keywordDensity === 'number') {
      lines.push(
        `- Keyword density: **${m.keywordDensity}%** (full band **0.8%–2.5%** → +2 pts; secondary **0.4%–3.5%** → +1 only)`,
      );
    }
    if (result.breakdown.serpTermAlignment >= DIMENSION_MAX.serpTermAlignment) {
      lines.push('- SERP entities: **25/25 maxed** — adding entity sentences will NOT raise score');
    }
  }

  if (gap === 1) {
    const serpMaxed = result.breakdown.serpTermAlignment >= DIMENSION_MAX.serpTermAlignment;
    lines.push(
      '',
      serpMaxed
        ? '**+1 point mode (SERP maxed)**: Fix ONE readability penalty only — replace 1 complex word, OR split 1 hard sentence, OR align Flesch ±8. Do NOT add SERP/entity sentences or new paragraphs.'
        : '**+1 point mode**: Make ONE scorer-visible fix (split 1 long sentence to ≤22 words, OR remove 1 passive, OR nudge keyword density into 0.8%–2.5%). Do NOT add SERP filler sentences.',
    );
  } else if (gap <= 2 && result.breakdown.keywordCoverage < DIMENSION_MAX.keywordCoverage) {
    lines.push(
      '',
      '**Near-pass keyword mode**: Adjust keyword density into **0.8%–2.5%** (worth +1 pt if currently in secondary band). Prefer editing existing sentences — do not add keyword bullet lists.',
    );
  }

  return lines.join('\n');
}

/** 计算 0–100 本地 SEO 分 */
export function scoreLocalSeo(input: LocalSeoScoreInput): LocalSeoScoreResult {
  const content = input.content ?? '';
  const keyword = input.keyword.trim();
  const keywordList = mergeKeywordLists(keyword, input.submittedKeywords);
  const primaryKeyword = keywordList[0] ?? keyword;
  const wordCountPreview = countWords(content);
  const targetWordCount =
    input.targetWordCount ?? inferSemrushWordCountTarget(wordCountPreview);
  const readabilityTarget = input.readabilityTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT;
  const serpTerms = extractSerpTerms(input.serpOrganic ?? [], primaryKeyword);

  const keywordPart = scoreKeywordCoverageList(keywordList, content);
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
  const keywordHits = countPhrase(content, primaryKeyword);
  const keywordDensity =
    (keywordHits * primaryKeyword.split(/\s+/).length) / Math.max(wordCount, 1);

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
      casualSentenceSamples:
        readabilityPart.casualSentenceSamples.length > 0
          ? readabilityPart.casualSentenceSamples
          : undefined,
      semrushComplexWordHits: readabilityPart.semrushComplexWordHits,
      semrushComplexWordSamples:
        readabilityPart.semrushComplexWordSamples.length > 0
          ? readabilityPart.semrushComplexWordSamples
          : undefined,
      hardToReadSentenceHits: readabilityPart.hardToReadSentenceHits,
      hardToReadSentenceSamples:
        readabilityPart.hardToReadSentenceSamples.length > 0
          ? readabilityPart.hardToReadSentenceSamples
          : undefined,
      longSentenceSamples: longSentenceSamples.length > 0 ? longSentenceSamples : undefined,
      longParagraphSamples: longParagraphSamples.length > 0 ? longParagraphSamples : undefined,
    },
  };
}
