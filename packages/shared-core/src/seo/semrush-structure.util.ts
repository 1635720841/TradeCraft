/**
 * Semrush 正文 Markdown 结构校验与自动修复（boost/LLM 后兜底）。
 *
 * 修复：`.##` 标题粘连、`word.Word` 句号后缺空格/换行、压平的 Markdown 表格。
 */

import { hasMalformedMarkdownTable, repairMarkdownTables } from './markdown-table-repair.util';

export interface SemrushStructureValidation {
  content: string;
  errors: string[];
  fixed: boolean;
}

const SEMRUSH_MARKDOWN_TITLE_MAX_CHARS = 60;
const SEMRUSH_MARKDOWN_TITLE_MAX_WORDS = 12;
const SEMRUSH_MARKDOWN_SECTION_MAX_CHARS = 110;
const SEMRUSH_MARKDOWN_SECTION_MAX_WORDS = 16;
const SEMRUSH_MARKDOWN_PARAGRAPH_MAX_WORDS = 65;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 移除被模型抄进正文的自动目录，并用目录标签恢复被压平的 H2 边界。 */
function repairLeakedTableOfContents(content: string): string {
  const toc = content.match(
    /(?:\bTable of contents\b|目录)\s*[:：]?\s*((?:[-•]\s*\[[^\]]+\]\([^)]+\)\s*){2,})/i,
  );
  if (!toc) return content;

  const labels = [...toc[1].matchAll(/[-•]\s*\[([^\]]+)\]\([^)]+\)/g)]
    .map((match) => match[1].trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  let result = content.replace(toc[0], '\n\n');

  for (const label of labels) {
    const heading = new RegExp(
      `(?:#{1,6}\\s*\\.?\\s*)?${escapeRegExp(label)}[ \\t]*`,
      'i',
    );
    if (!heading.test(result)) continue;
    result = result.replace(heading, `\n\n## ${label}\n\n`);
  }
  return result;
}

function repairOversizedSectionHeadings(content: string): string {
  return content
    .split('\n')
    .flatMap((line) => {
      const match = line.trim().match(/^(#{2,6})\s+(.+)$/);
      if (!match) return [line];
      const marker = match[1];
      const text = match[2].trim().replace(/^\.\s*/, '');
      const semanticSplit = splitHeadingBody(text);
      if (semanticSplit) {
        return [`${marker} ${semanticSplit.heading}`, '', semanticSplit.body];
      }
      const words = text.split(/\s+/).filter(Boolean);
      if (
        text.length <= SEMRUSH_MARKDOWN_SECTION_MAX_CHARS &&
        words.length <= SEMRUSH_MARKDOWN_SECTION_MAX_WORDS
      ) {
        return [`${marker} ${text}`];
      }

      const titleWords = words.slice(0, SEMRUSH_MARKDOWN_SECTION_MAX_WORDS);
      let title = titleWords.join(' ').slice(0, SEMRUSH_MARKDOWN_SECTION_MAX_CHARS).trim();
      const lastSpace = title.lastIndexOf(' ');
      if (title.length === SEMRUSH_MARKDOWN_SECTION_MAX_CHARS && lastSpace > 50) {
        title = title.slice(0, lastSpace);
      }
      title = title.replace(/[,:;.!?\-]+$/, '');
      const overflow = text.slice(title.length).trim();
      return overflow ? [`${marker} ${title}`, '', overflow] : [`${marker} ${title}`];
    })
    .join('\n');
}

function splitHeadingBody(text: string): { heading: string; body: string } | null {
  const dash = text.match(/^(.{4,80}?)\s+[–—-]\s+(.{12,})$/);
  if (dash && countWords(dash[1]) >= 2 && countWords(dash[2]) >= 4) {
    return { heading: dash[1].trim(), body: dash[2].trim() };
  }

  const suffixBoundary = text.match(
    /^(.{4,90}?\b(?:steps|setup|review|troubleshooting|matrix|overview|guide|checklist|requirements|considerations|works|means))\s+([A-Z][\s\S]{8,})$/i,
  );
  if (suffixBoundary && countWords(suffixBoundary[1]) >= 2) {
    return { heading: suffixBoundary[1].trim(), body: suffixBoundary[2].trim() };
  }

  const keywordEndBody = text.match(
    /^(.{4,110}?\b(?:steps|setup|guide|checklist|requirements|troubleshooting|overview|review|works|means|parameters|installation|configuration))\s+([A-Z][\s\S]{10,})$/i,
  );
  if (
    keywordEndBody &&
    countWords(keywordEndBody[1]) >= 2 &&
    countWords(keywordEndBody[1]) <= SEMRUSH_MARKDOWN_SECTION_MAX_WORDS &&
    countWords(keywordEndBody[2]) >= 4
  ) {
    return { heading: keywordEndBody[1].trim(), body: keywordEndBody[2].trim() };
  }

  const sentence = text.match(/^(.{12,110}?[.!?])\s+([A-Z][\s\S]{12,})$/);
  if (sentence && countWords(sentence[1]) >= 3) {
    return { heading: sentence[1].trim().replace(/\.$/, ''), body: sentence[2].trim() };
  }
  return null;
}

function normalizeMarkdownBlockSpacing(content: string): string {
  return content
    .replace(/[ \t]+\n/g, '\n')
    .replace(/([^\n])\n(#{1,6}\s+)/g, '$1\n\n$2')
    .replace(/(#{1,6}\s+[^\n]+)\n(?!\n|$)/g, '$1\n\n')
    .replace(/([^\n])\n(!\[[^\n]+\]\([^)]+\))/g, '$1\n\n$2')
    .replace(/(!\[[^\n]+\]\([^)]+\))\n(?!\n|$)/g, '$1\n\n')
    .replace(/([^\n])(!\[[^\]]*\]\([^)]+\))/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const ORDERED_LIST_LINE_RE = /^(\s*)(\d+)\.\s+(.+)$/;

/** 列表项正文是否仅为手写序号（如 `2.` / `3`），无实际内容 */
function isOrphanOrderedListBody(body: string): boolean {
  return /^\d+\.?$/.test(body.trim());
}

/**
 * 去掉有序列表项正文开头重复的手写序号（`1. 2. Disconnect` → `Disconnect`）。
 * 不匹配小数或段中序号（要求 `\d+. ` 后接非数字开头正文）。
 */
export function stripRedundantOrderedListBody(body: string): string {
  const trimmed = body.trim();
  const match = trimmed.match(/^(\d+)\.\s+(\S[\s\S]*)$/);
  if (!match) return trimmed;
  const rest = match[2].trim();
  if (!rest || isOrphanOrderedListBody(rest)) return trimmed;
  return rest;
}

/**
 * 修复 LLM 有序列表脏格式：去掉正文内重复序号、合并/丢弃「仅序号」空行。
 * 典型坏例：`1. 2.` + `1. Disconnect...` 或 `1. 2. Disconnect...`。
 */
export function repairOrderedListArtifacts(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(ORDERED_LIST_LINE_RE);
    if (!match) {
      result.push(line);
      continue;
    }

    const [, indent, markerNum, rawBody] = match;
    const body = rawBody.trim();

    if (isOrphanOrderedListBody(body)) {
      const nextMatch = lines[i + 1]?.match(ORDERED_LIST_LINE_RE);
      if (nextMatch) continue;
      continue;
    }

    result.push(`${indent}${markerNum}. ${stripRedundantOrderedListBody(body)}`);
  }

  return result.join('\n');
}

function isProseParagraphBlock(block: string): boolean {
  const t = block.trim();
  return (
    t.length > 0 &&
    !t.startsWith('#') &&
    !t.startsWith('![') &&
    !/^-\s+/m.test(t) &&
    !/^\d+\.\s+/m.test(t) &&
    !/^\|.+\|/m.test(t) &&
    !/\|[\s.:]*-{3,}/.test(t) &&
    !/\|\s*\|/.test(t) &&
    !/^```/m.test(t)
  );
}

function splitInlineOrderedSteps(text: string): { intro?: string; items: string[] } | null {
  const re = /(?:^|[\s:;])(\d+)\.\s+/g;
  const matches = [...text.matchAll(re)];
  if (matches.length < 2) return null;

  const firstIndex = matches[0].index ?? 0;
  const intro = text.slice(0, firstIndex).trimEnd();
  const items: string[] = [];

  for (let i = 0; i < matches.length; i += 1) {
    const marker = matches[i];
    const start = (marker.index ?? 0) + marker[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const item = text.slice(start, end).trim();
    if (item) items.push(item);
  }

  return items.length >= 2 ? { intro: intro || undefined, items } : null;
}

/**
 * 将段内「1. item 2. item」伪有序列表转为 Markdown 有序列表。
 * 不处理已是逐行 `1.` 开头的列表块。
 */
export function convertInlineOrderedEnumerations(content: string): string {
  const blocks = content.split(/\n\n+/);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !isProseParagraphBlock(trimmed)) {
      if (trimmed) result.push(trimmed);
      continue;
    }

    const steps = splitInlineOrderedSteps(trimmed);
    if (!steps) {
      result.push(trimmed);
      continue;
    }

    if (steps.intro) result.push(steps.intro);
    result.push(steps.items.map((item, index) => `${index + 1}. ${item}`).join('\n'));
  }

  return result.join('\n\n');
}

/** 去掉同类型列表项之间的空行，避免渲染成多个 `<ol>` 均从 1. 开始。 */
export function repairListBlankLineGaps(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() !== '') {
      result.push(line);
      continue;
    }

    const prev = result[result.length - 1]?.trim() ?? '';
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j += 1;
    const next = lines[j]?.trim() ?? '';
    const sameOrdered = /^\d+\.\s+/.test(prev) && /^\d+\.\s+/.test(next);
    const sameBullet = /^[-*]\s+/.test(prev) && /^[-*]\s+/.test(next);
    if (sameOrdered || sameBullet) continue;

    result.push(line);
  }

  return result.join('\n');
}

/**
 * 轻量结构修复（不依赖 detect 错误）：段内编号列表化、列表空行、有序列表脏序号。
 * 落库 / boost / 编辑器导出前均可调用。
 */
export function repairMarkdownStructureArtifacts(content: string): string {
  let result = content.replace(/\r\n/g, '\n');
  result = convertInlineOrderedEnumerations(result);
  result = repairListBlankLineGaps(result);
  result = repairOrderedListArtifacts(result);
  return result;
}

/** 清理 LLM/FAQ 遗留的 orphan `**`、重复列表符等 Markdown 脏字符 */
export function repairMarkdownProseArtifacts(content: string): string {
  let result = content.replace(/\r\n/g, '\n');

  result = result.replace(/^\s*\*{1,2}\s*$/gm, '');
  result = result.replace(/^\*{2}([^*\n]+?\?)\s*$/gm, '### $1');
  result = result.replace(/^(\s*)-\s+-\s+/gm, '$1- ');
  result = result.replace(/\n\*{2}\s*\n/g, '\n\n');
  result = result.replace(/([.!?])\s*\*{2}\s*\n/g, '$1\n\n');

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/** 用独立 title 字段恢复被模型压平的 `H1 + 首段`，不丢失首段文字。 */
export function enforceArticleH1Boundary(content: string, expectedTitle?: string): string {
  const title = expectedTitle?.trim().replace(/^#\s+/, '');
  if (!title) return content;
  const h1 = content.match(/^#\s+(.+)$/m);
  if (!h1) return `# ${title}\n\n${content.trim()}`;

  const currentLine = h1[1].trim();
  if (!currentLine.toLowerCase().startsWith(title.toLowerCase())) return content;
  const overflow = currentLine.slice(title.length).trim();
  const replacement = overflow ? `# ${title}\n\n${overflow}` : `# ${title}`;
  return content.replace(h1[0], replacement);
}

function repairOversizedH1(content: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  if (index < 0) return content;
  const line = lines[index].trim();
  const titleAndOverflow = line.replace(/^#\s+/, '').trim();
  const words = titleAndOverflow.split(/\s+/).filter(Boolean);
  if (
    titleAndOverflow.length <= SEMRUSH_MARKDOWN_TITLE_MAX_CHARS &&
    words.length <= SEMRUSH_MARKDOWN_TITLE_MAX_WORDS
  ) {
    return content;
  }

  let cutAt = Math.min(titleAndOverflow.length, SEMRUSH_MARKDOWN_TITLE_MAX_CHARS);
  if (words.length > SEMRUSH_MARKDOWN_TITLE_MAX_WORDS) {
    const firstWords = words.slice(0, SEMRUSH_MARKDOWN_TITLE_MAX_WORDS).join(' ');
    cutAt = Math.min(cutAt, firstWords.length);
  }
  const safeSlice = titleAndOverflow.slice(0, cutAt);
  const lastSpace = safeSlice.lastIndexOf(' ');
  if (lastSpace >= Math.floor(SEMRUSH_MARKDOWN_TITLE_MAX_CHARS * 0.55)) {
    cutAt = lastSpace;
  }

  const title = titleAndOverflow.slice(0, cutAt).trim().replace(/[,:;\-]+$/, '');
  const overflow = titleAndOverflow.slice(cutAt).trim();
  lines.splice(index, 1, `# ${title}`, ...(overflow ? ['', overflow] : []));
  return lines.join('\n');
}

function splitLongProseLine(line: string): string[] {
  const trimmed = line.trim();
  if (/^(#{1,6}\s+|[-*]\s+|\d+\.\s+|\|)/.test(trimmed)) {
    return [line];
  }
  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:["']|$)?|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (
    countWords(trimmed) <= SEMRUSH_MARKDOWN_PARAGRAPH_MAX_WORDS &&
    sentences.length <= 3
  ) {
    return [line];
  }
  if (sentences.length < 2) return [line];

  const paragraphs: string[] = [];
  let chunk: string[] = [];
  for (const sentence of sentences) {
    const candidate = [...chunk, sentence].join(' ');
    if (chunk.length > 0 && (chunk.length >= 3 || countWords(candidate) > 60)) {
      paragraphs.push(chunk.join(' '));
      chunk = [sentence];
    } else {
      chunk.push(sentence);
    }
  }
  if (chunk.length > 0) paragraphs.push(chunk.join(' '));
  return paragraphs.length > 1 ? paragraphs.flatMap((item, i) => (i === 0 ? [item] : ['', item])) : [line];
}

function splitLongListItem(line: string): string[] {
  const match = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
  if (!match) return [line];

  const isOrdered = /^\d+\.$/.test(match[2]);
  let body = match[3].trim();
  if (isOrdered) {
    body = stripRedundantOrderedListBody(body);
    if (!body || isOrphanOrderedListBody(body)) return [];
  }

  const sentences = body
    .match(/[^.!?]+[.!?]+(?:["']|$)?|[^.!?]+$/g)
    ?.map((item) => item.trim())
    .filter((item) => Boolean(item) && !(isOrdered && isOrphanOrderedListBody(item))) ?? [];
  if (countWords(body) <= 32 && sentences.length <= 2) {
    return [`${match[1]}${match[2]} ${body}`];
  }
  if (sentences.length < 2) return [`${match[1]}${match[2]} ${body}`];
  return sentences.map((sentence) => `${match[1]}${match[2]} ${sentence}`);
}

function normalizeHeadingKey(line: string): string | null {
  const match = line.trim().match(/^#{1,6}\s+(.+)$/);
  if (!match) return null;
  return match[1].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasDuplicateHeadings(content: string): boolean {
  const seen = new Set<string>();
  for (const line of content.split('\n')) {
    const key = normalizeHeadingKey(line);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasMissingHeadingSpacing(content: string): boolean {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  return lines.some((line, index) => {
    if (!/^#{1,6}\s+/.test(line.trim())) return false;
    const beforeMissing = index > 0 && Boolean(lines[index - 1]?.trim());
    const afterMissing = index < lines.length - 1 && Boolean(lines[index + 1]?.trim());
    return beforeMissing || afterMissing;
  });
}

function removeDuplicateHeadings(content: string): string {
  const seen = new Set<string>();
  const lines = content.split('\n').filter((line) => {
    const key = normalizeHeadingKey(line);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function hasListBlankLineGaps(content: string): boolean {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== '') continue;
    const prev = lines.slice(0, i).reverse().find((line) => line.trim())?.trim() ?? '';
    const next = lines.slice(i + 1).find((line) => line.trim())?.trim() ?? '';
    const sameOrdered = /^\d+\.\s+/.test(prev) && /^\d+\.\s+/.test(next);
    const sameBullet = /^[-*]\s+/.test(prev) && /^[-*]\s+/.test(next);
    if (sameOrdered || sameBullet) return true;
  }
  return false;
}

/** 检测常见结构损坏（不修改已有 `-` Markdown 列表块） */
export function detectSemrushStructureErrors(content: string): string[] {
  const errors: string[] = [];
  if (/(?:\bTable of contents\b|目录)\s*[:：]?\s*(?:[-•]\s*\[[^\]]+\]\([^)]+\)\s*){2,}/i.test(content)) {
    errors.push('leaked_table_of_contents');
  }
  if (/#{2,6}\.\s+/.test(content)) errors.push('malformed_heading_marker');
  if (/[^\n]!\[[^\]]*\]\([^)]+\)/.test(content)) errors.push('inline_image');
  if (/\.##/.test(content)) errors.push('heading_glued_after_period');
  if (/[^\n][ \t]+#{2,6}[ \t]+/.test(content)) errors.push('inline_heading_marker');
  if (/[a-z]\.[A-Z]/.test(content)) errors.push('missing_break_after_lowercase_period');
  if (/[.!?]##/.test(content)) errors.push('heading_missing_leading_newline');
  if (/[:;.!?][ \t]+-[ \t]+(?=[A-Za-z])/.test(content)) errors.push('inline_list_marker');
  if (
    content.split(/\n\n+/).some((block) => {
      const trimmed = block.trim();
      if (!isProseParagraphBlock(trimmed)) return false;
      return (trimmed.match(/(?:^|[\s:;])\d+\.\s+/g) ?? []).length >= 2;
    })
  ) {
    errors.push('inline_ordered_list_marker');
  }
  if (hasListBlankLineGaps(content)) errors.push('list_blank_line_gap');
  if (hasDuplicateHeadings(content)) errors.push('duplicate_heading');
  if (hasMissingHeadingSpacing(content)) errors.push('missing_heading_spacing');
  if (
    content.split('\n').some((line) => {
      const heading = line.trim().match(/^#{2,6}\s+(.+)$/)?.[1]?.trim();
      return Boolean(heading && splitHeadingBody(heading));
    })
  ) {
    errors.push('heading_contains_body');
  }
  if (
    content.split('\n').some((line) => {
      const heading = line.trim().match(/^#{2,6}\s+(.+)$/)?.[1]?.trim();
      return Boolean(
        heading &&
          (heading.length > SEMRUSH_MARKDOWN_SECTION_MAX_CHARS ||
            countWords(heading) > SEMRUSH_MARKDOWN_SECTION_MAX_WORDS),
      );
    })
  ) {
    errors.push('oversized_section_heading');
  }
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (
    h1 &&
    (h1.length > SEMRUSH_MARKDOWN_TITLE_MAX_CHARS ||
      countWords(h1) > SEMRUSH_MARKDOWN_TITLE_MAX_WORDS)
  ) {
    errors.push('oversized_h1');
  }
  if (
    content.split('\n').some((line) => {
      const trimmed = line.trim();
      return (
        !/^(#{1,6}\s+|[-*]\s+|\d+\.\s+|\|)/.test(trimmed) &&
        (countWords(trimmed) > SEMRUSH_MARKDOWN_PARAGRAPH_MAX_WORDS ||
          (trimmed.match(/[.!?]+/g)?.length ?? 0) > 3)
      );
    })
  ) {
    errors.push('oversized_paragraph');
  }
  if (
    content.split('\n').some((line) => {
      const item = line.trim().match(/^(?:[-*]|\d+\.)\s+(.+)$/)?.[1];
      return Boolean(item && (countWords(item) > 32 || (item.match(/[.!?]+/g)?.length ?? 0) > 2));
    })
  ) {
    errors.push('oversized_list_item');
  }
  if (hasMalformedMarkdownTable(content)) errors.push('malformed_markdown_table');
  if (/^\s*\*{1,2}\s*$/m.test(content)) errors.push('orphan_bold_marker');
  if (/^\*{2}[^*\n]+?\?\s*$/m.test(content)) errors.push('unclosed_bold_question');
  if (/^\s*-\s+-\s+/m.test(content)) errors.push('double_list_marker');
  if (
    content.split('\n').some((line) => {
      const item = line.trim().match(/^\d+\.\s+(.+)$/)?.[1]?.trim();
      return Boolean(item && isOrphanOrderedListBody(item));
    })
  ) {
    errors.push('orphan_ordered_list_marker');
  }
  if (
    content.split('\n').some((line) => {
      const item = line.trim().match(/^\d+\.\s+(\d+\.\s+\S)/)?.[1];
      return Boolean(item);
    })
  ) {
    errors.push('duplicate_ordered_list_marker');
  }
  return errors;
}

/** 自动修复结构损坏，保证 `## Heading` 与段落间有空行 */
export function validateAndFixSemrushStructure(content: string): SemrushStructureValidation {
  const source = content.replace(/\r\n/g, '\n');
  let result = repairMarkdownStructureArtifacts(source);
  const errors = detectSemrushStructureErrors(result);
  if (errors.length === 0 && result === source) {
    return { content: result, errors: [], fixed: false };
  }

  result = repairLeakedTableOfContents(result);
  result = repairMarkdownTables(result);
  result = repairMarkdownProseArtifacts(result);
  result = result.replace(/(#{2,6})\.\s+/g, '$1 ');
  result = result.replace(/\.##/g, '.\n\n##');
  result = result.replace(/([.!?])##/g, '$1\n\n##');
  result = result.replace(/([^\n])[ \t]+(#{2,6})[ \t]+/g, '$1\n\n$2 ');
  result = result.replace(/([:;.!?])[ \t]+-[ \t]+(?=[A-Za-z])/g, '$1\n\n- ');
  result = result.replace(/([a-z])\.([A-Z][a-z])/g, '$1.\n\n$2');
  result = repairOversizedH1(result);
  result = repairOversizedSectionHeadings(result);
  result = removeDuplicateHeadings(result);
  result = result
    .split('\n')
    .flatMap(splitLongListItem)
    .flatMap(splitLongProseLine)
    .join('\n');

  result = normalizeMarkdownBlockSpacing(result);
  result = repairMarkdownStructureArtifacts(result);

  return {
    content: result,
    errors,
    fixed: result !== source,
  };
}
