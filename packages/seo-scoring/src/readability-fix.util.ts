/**
 * 本地 SEO 可读性确定性修复：超长句拆分、填充词删减、篇幅压线。
 *
 * 边界：
 * - 不负责：LLM 调用（SeoCheckerService / LlmService）
 * - 计数规则与 local-seo-score.scoreReadability 对齐（>22 词长句）
 */

import { stripRedundantOrderedListBody, repairMarkdownStructureArtifacts } from './semrush-structure.util';

const LONG_SENTENCE_MAX_WORDS = 22;
/** 与 Semrush SWA 本地预检对齐：单段 >65 词计为超长段 */
const LONG_PARAGRAPH_MAX_WORDS = 65;
/** Semrush SWA 侧栏「段落太长」阈值（prompt 与 SWA 对齐） */
export const SEMRUSH_PARAGRAPH_MAX_WORDS = 60;
export const SEMRUSH_PARAGRAPH_MAX_SENTENCES = 3;
const MIN_SENTENCE_WORDS = 4;
const STRUCTURE_MAX_RATIO = 1.05;

export interface LongSentenceSample {
  text: string;
  wordCount: number;
}

export interface LongParagraphSample {
  text: string;
  wordCount: number;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.trim().length > 0).length;
}

/** 去除行内 Markdown 标记与图片占位，避免污染句子词数统计 */
function stripInlineMarkdownForSentence(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // ![alt](url) 图片
    .replace(/\[image:[^\]]*\]/gi, ' ') // [Image: ...] 占位
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) 链接保留文字
    .replace(/[`*_~]+/g, ' ') // 强调 / 行内代码标记
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 将 Markdown 正文拆为「面向句子统计」的纯文本行：
 * - 跳过标题 / 图片 / 表格 / 代码围栏
 * - 列表项按行各自独立（不与引导句 `...are:` 合并）
 * - 清理行内图片 / 链接标记
 *
 * 修复点：原先直接对整段 Markdown 用 [.!?] 切句，会把
 * 「引导句: - 项 - 项 [Image: ...] 下一句.」误判成一整句超长句。
 */
function extractProseLinesForSentences(content: string): string[] {
  const lines: string[] = [];
  let inCodeFence = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || !line) continue;
    if (line.startsWith('#')) continue; // 标题
    if (line.startsWith('![')) continue; // 图片
    if (/^\[image:/i.test(line)) continue; // 图片占位行
    if (/^\|/.test(line)) continue; // 表格行
    let body = line.replace(/^>\s?/, ''); // 去引用标记
    const listMatch = MARKDOWN_LIST_ITEM_RE.exec(body);
    if (listMatch) body = listMatch[2];
    const cleaned = stripInlineMarkdownForSentence(body);
    if (cleaned) lines.push(cleaned);
  }
  return lines;
}

/** 与 scoreReadability 一致：Markdown 感知地按行 + [.!?] 切句并统计 >22 词 */
export function extractLongSentences(
  content: string,
  maxWords = LONG_SENTENCE_MAX_WORDS,
): LongSentenceSample[] {
  const samples: LongSentenceSample[] = [];
  for (const line of extractProseLinesForSentences(content)) {
    for (const piece of line.split(/[.!?]+/)) {
      const text = piece.trim();
      const words = countWords(text);
      if (words >= MIN_SENTENCE_WORDS && words > maxWords) {
        samples.push({ text, wordCount: words });
      }
    }
  }
  return samples;
}

function countSentencesInBlock(text: string): number {
  const re = /([^.!?]+[.!?]+)/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (countWords(m[1]) >= MIN_SENTENCE_WORDS) count += 1;
  }
  return count;
}

const MARKDOWN_LIST_ITEM_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)(.+)$/;

function extractMarkdownListItems(block: string): string[] {
  return block
    .split('\n')
    .map((line) => MARKDOWN_LIST_ITEM_RE.exec(line)?.[2]?.trim())
    .filter((text): text is string => Boolean(text));
}

/**
 * 将段内「 - item - item」或「: - item」伪列表转为 Markdown `-` 列表，避免 SWA 整段标紫。
 */
export function convertInlineDashEnumerations(content: string): string {
  const blocks = content.split(/\n\n+/);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !isBodyParagraphBlock(trimmed)) {
      if (trimmed) result.push(trimmed);
      continue;
    }

    if (/^-\s+/m.test(trimmed)) {
      result.push(trimmed);
      continue;
    }

    const dashParts = trimmed.split(/\s+-\s+/);
    if (dashParts.length >= 3) {
      const intro = dashParts[0].trim();
      const items = dashParts.slice(1).map((s) => s.trim()).filter(Boolean);
      if (items.length >= 2) {
        const introClean = intro.replace(/:\s*$/, '').trim();
        if (introClean) result.push(introClean);
        result.push(items.map((item) => `- ${item}`).join('\n'));
        continue;
      }
    }

    result.push(trimmed);
  }

  return result.join('\n\n');
}

function splitParagraphByMaxSentences(paragraph: string, maxSentences: number): string[] {
  const trimmed = paragraph.trim();
  if (countSentencesInBlock(trimmed) <= maxSentences) return [trimmed];

  const sentenceRe = /([^.!?]+[.!?]+)\s*/g;
  const sentences: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(trimmed)) !== null) {
    const sent = m[1].trim();
    if (sent && countWords(sent) >= MIN_SENTENCE_WORDS) sentences.push(sent);
  }

  if (sentences.length <= maxSentences) return [trimmed];

  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += maxSentences) {
    chunks.push(sentences.slice(i, i + maxSentences).join(' '));
  }
  return chunks;
}

function isBodyParagraphBlock(block: string): boolean {
  const t = block.trim();
  return (
    t.length > 0 &&
    !t.startsWith('#') &&
    !t.startsWith('![') &&
    !/^-\s+/.test(t) &&
    !/^\|.+\|/m.test(t) &&
    !/\|[\s.:]*-{3,}/.test(t) &&
    !/\|\s*\|/.test(t) &&
    !/^```/m.test(t)
  );
}

/** 与 scoreReadability 一致：正文段 >65 词 */
export function extractLongParagraphs(
  content: string,
  maxWords = LONG_PARAGRAPH_MAX_WORDS,
  maxSentences?: number,
): LongParagraphSample[] {
  const samples: LongParagraphSample[] = [];
  for (const block of content.split(/\n\n+/)) {
    const text = block.trim();
    const listItems = extractMarkdownListItems(block);
    if (listItems.length > 0) {
      for (const item of listItems) {
        const words = countWords(item);
        if (
          words > maxWords ||
          (maxSentences != null && countSentencesInBlock(item) > maxSentences)
        ) {
          samples.push({ text: item, wordCount: words });
        }
      }
      continue;
    }
    if (!isBodyParagraphBlock(text)) continue;
    const words = countWords(text);
    if (
      words > maxWords ||
      (maxSentences != null && countSentencesInBlock(text) > maxSentences)
    ) {
      samples.push({ text, wordCount: words });
    }
  }
  return samples;
}

function splitParagraphIntoChunks(paragraph: string, maxWords: number): string[] {
  const trimmed = paragraph.trim();
  if (countWords(trimmed) <= maxWords) return [trimmed];

  const sentenceRe = /([^.!?]+[.!?]+)\s*/g;
  const sentences: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(trimmed)) !== null) {
    const sent = m[1].trim();
    if (sent) sentences.push(sent);
  }

  if (sentences.length <= 1) {
    const words = trimmed.split(/\s+/);
    const mid = Math.max(MIN_SENTENCE_WORDS, Math.floor(words.length / 2));
    return [
      words.slice(0, mid).join(' '),
      words.slice(mid).join(' '),
    ];
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sent of sentences) {
    const w = countWords(sent);
    if (currentWords > 0 && currentWords + w > maxWords) {
      chunks.push(current.join(' '));
      current = [sent];
      currentWords = w;
    } else {
      current.push(sent);
      currentWords += w;
    }
  }
  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  const expanded: string[] = [];
  for (const chunk of chunks) {
    if (countWords(chunk) > maxWords) {
      expanded.push(...splitParagraphIntoChunks(chunk, maxWords));
    } else {
      expanded.push(chunk);
    }
  }
  return expanded;
}

/** 将正文超长段按句界/句数拆为合规段落 */
export interface ParagraphFixOptions {
  maxWords?: number;
  maxSentences?: number;
}

export function applyReadabilityParagraphFix(
  content: string,
  maxWordsOrOptions: number | ParagraphFixOptions = LONG_PARAGRAPH_MAX_WORDS,
): string {
  const opts =
    typeof maxWordsOrOptions === 'number'
      ? { maxWords: maxWordsOrOptions }
      : maxWordsOrOptions;
  const maxWords = opts.maxWords ?? LONG_PARAGRAPH_MAX_WORDS;
  const maxSentences = opts.maxSentences;

  const blocks = content.split(/\n\n+/);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const listLines = block.split('\n');
    if (listLines.some((line) => MARKDOWN_LIST_ITEM_RE.test(line))) {
      const fixedLines: string[] = [];
      for (const line of listLines) {
        const match = MARKDOWN_LIST_ITEM_RE.exec(line);
        if (!match) {
          fixedLines.push(line.trimEnd());
          continue;
        }

        const prefix = match[1];
        const isOrdered = /^\s*\d+[.)]\s+$/.test(prefix);
        let body = match[2].trim();
        if (isOrdered) {
          body = stripRedundantOrderedListBody(body);
        }
        let chunks = [body];
        if (
          maxSentences != null &&
          maxSentences > 0 &&
          countSentencesInBlock(body) > maxSentences
        ) {
          chunks = splitParagraphByMaxSentences(body, maxSentences);
        }

        const expanded = chunks.flatMap((chunk) =>
          countWords(chunk) > maxWords ? splitParagraphIntoChunks(chunk, maxWords) : [chunk],
        );
        fixedLines.push(...expanded.map((chunk) => `${prefix}${chunk}`));
      }
      result.push(fixedLines.join('\n'));
      continue;
    }
    if (!isBodyParagraphBlock(trimmed)) {
      result.push(trimmed);
      continue;
    }

    let chunks = [trimmed];
    if (
      maxSentences != null &&
      maxSentences > 0 &&
      countSentencesInBlock(trimmed) > maxSentences
    ) {
      chunks = splitParagraphByMaxSentences(trimmed, maxSentences);
    }

    const expanded: string[] = [];
    for (const chunk of chunks) {
      if (countWords(chunk) > maxWords) {
        expanded.push(...splitParagraphIntoChunks(chunk, maxWords));
      } else {
        expanded.push(chunk);
      }
    }
    result.push(...expanded);
  }

  return result.join('\n\n');
}

function joinSplitParts(left: string, right: string): string {
  const l = left.trim().replace(/[.!?]+$/, '');
  const r = right.trim().replace(/^[.!?]+/, '');
  if (!l || !r) return `${l}${r}`.trim();
  return `${l}. ${r}`;
}

/** 递归拆分单条超长句至 ≤maxWords（保留事实，仅增句号） */
export function splitLongSentence(sentence: string, maxWords = LONG_SENTENCE_MAX_WORDS): string {
  const trimmed = sentence.trim();
  if (countWords(trimmed) <= maxWords) return trimmed;

  const splitPatterns: RegExp[] = [
    /;\s+/,
    /\s+—\s+/,
    /\s+–\s+/,
    /,\s+(and|but|which|while|because|so|or|yet|whereas|although|however)\s+/i,
    /,\s+/,
  ];

  for (const pattern of splitPatterns) {
    const hit = pattern.exec(trimmed);
    if (hit?.index != null) {
      const left = trimmed.slice(0, hit.index).trim();
      const right = trimmed.slice(hit.index + hit[0].length).trim();
      if (countWords(left) >= MIN_SENTENCE_WORDS && countWords(right) >= MIN_SENTENCE_WORDS) {
        return joinSplitParts(
          splitLongSentence(left, maxWords),
          splitLongSentence(right, maxWords),
        );
      }
    }
  }

  const words = trimmed.split(/\s+/);
  const mid = Math.max(MIN_SENTENCE_WORDS, Math.floor(words.length / 2));
  const left = words.slice(0, mid).join(' ');
  const right = words.slice(mid).join(' ');
  return joinSplitParts(splitLongSentence(left, maxWords), splitLongSentence(right, maxWords));
}

const FILLER_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bit is important to note that\b/gi, replacement: '' },
  { pattern: /\bin order to\b/gi, replacement: 'to' },
  { pattern: /\bdue to the fact that\b/gi, replacement: 'because' },
  { pattern: /\bat this point in time\b/gi, replacement: 'now' },
  { pattern: /\bfor the purpose of\b/gi, replacement: 'to' },
  { pattern: /\bin the event that\b/gi, replacement: 'if' },
  { pattern: /\bwith regard to\b/gi, replacement: 'about' },
  { pattern: /\bas a matter of fact\b/gi, replacement: '' },
  { pattern: /\bit is worth noting that\b/gi, replacement: '' },
  { pattern: /\bAdditionally,\s*/gi, replacement: '' },
  { pattern: /\bFurthermore,\s*/gi, replacement: '' },
  { pattern: /\bMoreover,\s*/gi, replacement: '' },
];

/** 删除常见填充词组（不改事实句） */
export function trimFillerPhrases(content: string): string {
  let result = content;
  for (const { pattern, replacement } of FILLER_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n');
}

/** 将 [.!?] 界定的超长句拆至 ≤22 词 */
export function applyReadabilitySentenceFix(content: string): string {
  const re = /([^.!?]+)([.!?]+)/g;
  return content.replace(re, (full, rawText: string, punct: string) => {
    const text = rawText.trim();
    if (countWords(text) < MIN_SENTENCE_WORDS || countWords(text) <= LONG_SENTENCE_MAX_WORDS) {
      return full;
    }
    const fixed = splitLongSentence(text);
    return `${fixed}${punct}`;
  });
}

function isSkippableBlock(block: string): boolean {
  return !isBodyParagraphBlock(block);
}

/** 从最长正文段末尾删句，直至词数 ≤ maxWords */
export function trimBodyToWordCap(content: string, maxWords: number): string {
  if (countWords(content) <= maxWords) return content;

  let result = content;

  for (let attempt = 0; attempt < 24 && countWords(result) > maxWords; attempt += 1) {
    const paragraphs = result.split(/\n\n+/);
    let longestIdx = -1;
    let longestWords = 0;

    for (let i = 0; i < paragraphs.length; i += 1) {
      const p = paragraphs[i].trim();
      if (!p || isSkippableBlock(p)) continue;
      const w = countWords(p);
      if (w > longestWords) {
        longestWords = w;
        longestIdx = i;
      }
    }

    if (longestIdx < 0) break;

    const para = paragraphs[longestIdx];
    const sentenceRe = /([^.!?]+[.!?]+)\s*/g;
    const sentences: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = sentenceRe.exec(para)) !== null) {
      sentences.push(m[1]);
    }

    if (sentences.length <= 1) {
      paragraphs.splice(longestIdx, 1);
    } else {
      sentences.pop();
      paragraphs[longestIdx] = sentences.join(' ').trim();
    }

    result = paragraphs.filter(Boolean).join('\n\n');
  }

  return result.trim();
}

export interface BoostLocalSeoContentOptions {
  targetWordCount?: number;
  maxStructureRatio?: number;
  /** 默认 65（Semrush SWA 对齐）；Semrush 轮应传 60 */
  maxParagraphWords?: number;
  /** Semrush 轮建议 3（2–3 句/段） */
  maxParagraphSentences?: number;
  /** 将段内 dash 枚举转为 Markdown 列表 */
  convertInlineLists?: boolean;
  /** 手术式轮：跳过拆句，避免破坏已改句子 */
  skipSentenceFix?: boolean;
  /** 手术式轮：跳过篇幅压线删减 */
  skipWordCap?: boolean;
}

/**
 * 确定性提分：填充词 → 超长句拆分 → 超长段拆分 → 篇幅压线（105% 目标词数）。
 * 返回新正文（若无改动则与输入相同）。
 */
export function boostLocalSeoContent(
  content: string,
  options: BoostLocalSeoContentOptions = {},
): string {
  const target = options.targetWordCount ?? 1500;
  const maxRatio = options.maxStructureRatio ?? STRUCTURE_MAX_RATIO;
  const wordCap = Math.ceil(target * maxRatio);
  const maxParaWords = options.maxParagraphWords ?? LONG_PARAGRAPH_MAX_WORDS;
  const paraFixOpts: ParagraphFixOptions = {
    maxWords: maxParaWords,
    maxSentences: options.maxParagraphSentences,
  };

  let result = trimFillerPhrases(content);
  if (options.convertInlineLists) {
    result = convertInlineDashEnumerations(result);
  }
  if (!options.skipSentenceFix) {
    result = applyReadabilitySentenceFix(result);

    for (let i = 0; i < 8; i += 1) {
      const next = applyReadabilitySentenceFix(result);
      if (next === result) break;
      result = next;
    }
  }

  result = applyReadabilityParagraphFix(result, paraFixOpts);

  for (let i = 0; i < 8; i += 1) {
    const next = applyReadabilityParagraphFix(result, paraFixOpts);
    if (next === result) break;
    result = next;
  }

  if (!options.skipWordCap && countWords(result) > wordCap) {
    result = trimBodyToWordCap(result, wordCap);
  }

  result = repairMarkdownStructureArtifacts(result);

  return result;
}
