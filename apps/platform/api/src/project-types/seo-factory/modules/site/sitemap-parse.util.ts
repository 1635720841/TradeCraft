/**
 * Sitemap XML 解析纯函数（loc / lastmod / priority）。
 *
 * 边界：
 * - 不负责：HTTP 抓取（SiteArticleCrawlerService）
 */

export interface SitemapUrlEntry {
  url: string;
  lastmod: Date | null;
  priority: number | null;
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*<\\/${tag}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

/** 解析 ISO 8601 / YYYY-MM-DD 格式的 lastmod */
export function parseSitemapLastmod(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 解析 sitemap priority（0~1），非法值返回 null */
export function parseSitemapPriority(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const num = Number(value.trim());
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    return null;
  }

  return num;
}

/** 从 sitemap XML 提取页面 URL 条目（含 lastmod / priority） */
export function parseSitemapUrlEntries(xml: string): SitemapUrlEntry[] {
  const entries: SitemapUrlEntry[] = [];
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi;

  for (const match of xml.matchAll(urlBlockRegex)) {
    const block = match[1];
    const loc = extractTag(block, 'loc');
    if (!loc || /sitemap.*\.xml$/i.test(loc)) {
      continue;
    }

    entries.push({
      url: loc,
      lastmod: parseSitemapLastmod(extractTag(block, 'lastmod')),
      priority: parseSitemapPriority(extractTag(block, 'priority')),
    });
  }

  if (entries.length > 0) {
    return entries;
  }

  // 无标准 <url> 块时回退为仅 loc（兼容非标准 sitemap）
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter((loc) => loc && !/sitemap.*\.xml$/i.test(loc))
    .map((url) => ({ url, lastmod: null, priority: null }));
}

/** 提取子 sitemap 索引地址 */
export function extractChildSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter((loc) => /sitemap.*\.xml$/i.test(loc));
}
