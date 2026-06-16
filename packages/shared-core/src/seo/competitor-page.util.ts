/**
 * 竞品页面 HTML 轻量解析：标题、H 标签、正文摘录（无 DOM 依赖）。
 *
 * 边界：
 * - 不负责：HTTP 抓取（由 Scraper 模块处理）
 */

export interface SerpOrganicScrapedMeta {
  wordCount: number;
  headings: string[];
  excerpt: string;
  metaDescription?: string;
  scrapedAt: string;
  error?: string;
}

const BLOCK_TAGS = /<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;

export function stripHtmlBlocks(html: string): string {
  return html.replace(BLOCK_TAGS, ' ');
}

export function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

export function stripHtmlTags(html: string): string {
  return decodeBasicHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function extractMetaDescription(html: string): string | undefined {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (!match?.[1]) return undefined;
  return normalizeWhitespace(decodeBasicHtmlEntities(match[1]));
}

export function extractHeadings(html: string, maxHeadings = 20): string[] {
  const headings: string[] = [];
  const pattern = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match && headings.length < maxHeadings) {
    const text = normalizeWhitespace(stripHtmlTags(match[2]));
    if (text.length > 0) {
      headings.push(text);
    }
    match = pattern.exec(html);
  }
  return headings;
}

export function extractMainText(html: string, maxChars = 8000): string {
  const withoutBlocks = stripHtmlBlocks(html);
  const bodyMatch = withoutBlocks.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const source = bodyMatch?.[1] ?? withoutBlocks;
  const text = normalizeWhitespace(stripHtmlTags(source));
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trim()}…`;
}

export function normalizeCompetitorUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function parseCompetitorPageHtml(
  html: string,
  options: { maxChars?: number; maxHeadings?: number } = {},
): Omit<SerpOrganicScrapedMeta, 'scrapedAt' | 'error'> {
  const maxChars = options.maxChars ?? 8000;
  const maxHeadings = options.maxHeadings ?? 20;
  const excerpt = extractMainText(html, maxChars);
  return {
    wordCount: countWords(excerpt),
    headings: extractHeadings(html, maxHeadings),
    excerpt,
    metaDescription: extractMetaDescription(html),
  };
}
