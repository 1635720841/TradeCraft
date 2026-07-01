/**
 * 润色前屏蔽 Markdown 链接/配图，润色后确定性恢复，避免 LLM 破坏长签名 URL。
 *
 * 边界：
 * - 不负责：LLM 调用（ParaphraseService）
 */

import { PARAPHRASE_MIN_PROSE_CHARS } from '../../constants/paraphrase';
import { chunkHasAntiAiPhrases } from './paraphrase-cliche.util';

const MARKDOWN_MEDIA_PATTERN = /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)/g;
const MEDIA_PLACEHOLDER_PATTERN = /⟦MEDIA:(\d+)⟧/g;
const FUZZY_MEDIA_PLACEHOLDER_PATTERN = /⟦\s*MEDIA\s*:\s*(\d+)\s*⟧/gi;

export interface ParaphraseMediaShield {
  content: string;
  tokens: string[];
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractUrlFromExpression(expression: string): string | undefined {
  const match = expression.match(/\(([^)]+)\)/);
  return match?.[1]?.trim();
}

function normalizeUrlForCompare(url: string): string {
  return url.replace(/\s+/g, '').trim();
}

/** 提取正文中全部 Markdown 链接/配图完整表达式（去重保序） */
export function extractMarkdownMediaExpressions(content: string): string[] {
  const seen = new Set<string>();
  const expressions: string[] = [];
  const pattern = new RegExp(MARKDOWN_MEDIA_PATTERN.source, 'g');
  let match = pattern.exec(content);
  while (match) {
    const expr = match[0];
    if (!seen.has(expr)) {
      seen.add(expr);
      expressions.push(expr);
    }
    match = pattern.exec(content);
  }
  return expressions;
}

/** 合并括号内被 LLM 拆行/插空格的 URL */
export function normalizeBrokenMarkdownUrls(content: string): string {
  return content.replace(/(!?\[[^\]]*\]\()([\s\S]*?)(\))/g, (_match, prefix, url, suffix) => {
    const cleaned = String(url).replace(/\s+/g, '');
    return `${prefix}${cleaned}${suffix}`;
  });
}

/** 润色前将链接/配图替换为占位符，避免模型改写 URL */
export function shieldParaphraseMedia(content: string): ParaphraseMediaShield {
  const tokens: string[] = [];
  const shielded = content.replace(MARKDOWN_MEDIA_PATTERN, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `⟦MEDIA:${index}⟧`;
  });
  return { content: shielded, tokens };
}

/** 润色后将占位符还原为原始 Markdown 表达式（支持轻微格式偏差） */
export function unshieldParaphraseMedia(content: string, tokens: string[]): string {
  let result = content;
  for (let index = 0; index < tokens.length; index += 1) {
    const exact = `⟦MEDIA:${index}⟧`;
    if (result.includes(exact)) {
      result = result.split(exact).join(tokens[index]);
    }
  }
  result = result.replace(FUZZY_MEDIA_PLACEHOLDER_PATTERN, (_match, indexRaw) => {
    const index = Number(indexRaw);
    return tokens[index] ?? _match;
  });
  return result.replace(MEDIA_PLACEHOLDER_PATTERN, (_match, indexRaw) => {
    const index = Number(indexRaw);
    return tokens[index] ?? _match;
  });
}

function findSectionHeadingBefore(content: string, position: number): string | undefined {
  const before = content.slice(0, position);
  const matches = [...before.matchAll(/^## (.+)$/gm)];
  return matches.at(-1)?.[1]?.trim();
}

function insertExpressionAfterHeading(content: string, heading: string, expression: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'i');
  const headingIndex = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (headingIndex < 0) {
    const trimmed = content.trimEnd();
    return trimmed ? `${trimmed}\n\n${expression}` : expression;
  }

  lines.splice(headingIndex + 1, 0, '', expression);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function contentContainsUrl(content: string, url: string): boolean {
  const normalizedUrl = normalizeUrlForCompare(url);
  if (normalizeUrlForCompare(content).includes(normalizedUrl)) return true;
  return normalizeBrokenMarkdownUrls(content).includes(normalizedUrl);
}

function replaceCorruptedMediaWithOriginal(content: string, expression: string): string {
  const url = extractUrlFromExpression(expression);
  if (!url) return content;
  const urlNorm = normalizeUrlForCompare(url);
  return content.replace(/(!?\[[^\]]*\]\()([\s\S]*?)(\))/g, (full, _prefix, urlPart, _suffix) => {
    if (normalizeUrlForCompare(String(urlPart)) === urlNorm) {
      return expression;
    }
    return full;
  });
}

function insertExpressionFromOriginalAnchor(
  original: string,
  content: string,
  expression: string,
): string {
  const position = original.indexOf(expression);
  const heading = position >= 0 ? findSectionHeadingBefore(original, position) : undefined;
  if (heading) {
    return insertExpressionAfterHeading(content, heading, expression);
  }
  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n\n${expression}` : expression;
}

/** 对比原文，补回缺失或被改坏的链接/配图 Markdown */
export function restoreParaphraseMarkdownMedia(original: string, paraphrased: string): string {
  let result = normalizeBrokenMarkdownUrls(paraphrased);

  for (const expression of extractMarkdownMediaExpressions(original)) {
    const url = extractUrlFromExpression(expression);
    if (!url) continue;

    result = replaceCorruptedMediaWithOriginal(result, expression);

    if (contentContainsUrl(result, url)) continue;
    result = insertExpressionFromOriginalAnchor(original, result, expression);
  }

  return result;
}

/** 以原文为唯一真相，强制同步全部配图/内链 Markdown */
export function syncAllMediaFromOriginal(original: string, revised: string): string {
  return restoreParaphraseMarkdownMedia(original, normalizeBrokenMarkdownUrls(revised));
}

/** 屏蔽占位符后可用于润色的正文字符数（不含标题行） */
export function measureParaphraseProseLength(content: string): number {
  const { content: shielded } = shieldParaphraseMedia(content);
  const withoutHeadings = shielded.replace(/^#{1,6}\s+.*$/gm, '');
  const withoutPlaceholders = withoutHeadings.replace(/⟦MEDIA:\d+⟧/g, '');
  return withoutPlaceholders.replace(/\s+/g, '').length;
}

export interface ParaphraseChunkSkipOptions {
  isLead?: boolean;
}

/** 返回跳过原因；undefined 表示可调用 LLM 润色 */
export function resolveParaphraseChunkSkip(
  content: string,
  options?: ParaphraseChunkSkipOptions,
): string | undefined {
  const proseLen = measureParaphraseProseLength(content);
  const mediaCount = extractMarkdownMediaExpressions(content).length;
  const hasCliches = chunkHasAntiAiPhrases(content);

  if (options?.isLead) {
    if (!hasCliches) return 'lead_section';
    if (proseLen < PARAPHRASE_MIN_PROSE_CHARS) return 'short_prose';
    return undefined;
  }

  if (proseLen < 80 && mediaCount > 0) return 'minimal_prose';
  if (proseLen < PARAPHRASE_MIN_PROSE_CHARS) return 'short_prose';
  if (mediaCount > 0 && proseLen < 280) return 'media_heavy';
  if (!hasCliches) return 'no_ai_cliches';

  return undefined;
}

export function shouldSkipParaphraseChunk(
  content: string,
  options?: ParaphraseChunkSkipOptions,
): boolean {
  return resolveParaphraseChunkSkip(content, options) !== undefined;
}

/** 屏蔽 → 润色结果还原 → 兜底恢复 */
export function finalizeParaphraseMediaContent(
  original: string,
  paraphrased: string,
  tokens: string[],
): string {
  const unshielded = unshieldParaphraseMedia(paraphrased, tokens);
  return syncAllMediaFromOriginal(original, unshielded);
}
