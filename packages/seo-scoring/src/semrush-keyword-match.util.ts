/**
 * Semrush SWA 关键词命中：正文 vs 目标短语（绿/灰 Tag 同源逻辑）。
 *
 * 边界：
 * - 不负责：RPA 侧栏 DOM 解析
 * - 不负责：DB / HTTP
 */

export function stripMarkdownForKeywordMatch(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/[/\\]/g, ' ')
    .replace(/[.,;:!?()[\]{}'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const FILLER_BETWEEN_TOKENS =
  '(?:\\s+(?:their|the|your|a|an|of|on|for|to|in|at|with|and|or|is|are|can|i)\\s+)*';

function flexTokenPattern(token: string): string {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (token.length >= 4) return `${esc}(?:ing|s|ed|er|ers)?`;
  return esc;
}

function isFlexiblePhrasePresent(haystack: string, phrase: string): boolean {
  const tokens = phrase.split(/\s+/).filter((w) => w.length >= 2);
  if (tokens.length < 2) return false;

  const pattern = tokens
    .map((token, index) => {
      const part = `\\b${flexTokenPattern(token)}\\b`;
      return index === 0 ? part : `${FILLER_BETWEEN_TOKENS}${part}`;
    })
    .join('');

  try {
    return new RegExp(pattern, 'i').test(haystack);
  } catch {
    return false;
  }
}

/** SWA：短语是否已写入正文（不区分大小写；支持连字符与轻量词形变体） */
export function isSemrushKeywordPresentInContent(content: string, keyword: string): boolean {
  const needle = keyword
    .trim()
    .toLowerCase()
    .replace(/[/\\]/g, ' ')
    .replace(/[.,;:!?()[\]{}'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (needle.length < 2) return true;

  const haystack = stripMarkdownForKeywordMatch(content);
  if (haystack.includes(needle)) return true;

  const relaxed = needle.replace(/-/g, ' ');
  if (relaxed !== needle && haystack.includes(relaxed)) return true;

  return isFlexiblePhrasePresent(haystack, needle);
}

export function findMissingSemrushKeywords(content: string, keywords: string[]): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isSemrushKeywordPresentInContent(content, trimmed)) {
      missing.push(trimmed);
    }
  }

  return missing;
}
