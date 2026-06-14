/**
 * SEO 文章页识别与 SERP 有机结果过滤。
 *
 * 边界：
 * - 不负责：页面正文抓取（由 Scraper / Site 模块处理）
 */

export interface SerpOrganicItem {
  position?: number;
  title?: string;
  snippet?: string;
  link?: string;
}

export interface SerpOrganicFilterMeta {
  total: number;
  kept: number;
  excluded: number;
  articlesOnly: boolean;
  limit: number;
}

const EXCLUDE_HOST_FRAGMENTS = [
  'amazon.',
  'ebay.',
  'youtube.',
  'youtu.be',
  'facebook.',
  'twitter.',
  'x.com',
  'instagram.',
  'pinterest.',
  'walmart.',
  'aliexpress.',
  'reddit.com',
];

const EXCLUDE_PATH_FRAGMENTS = [
  '/product',
  '/products/',
  '/shop/',
  '/cart',
  '/checkout',
  '/login',
  '/signup',
  '/register',
  '/account',
  '/tag/',
  '/category/',
  '/categories/',
  '/collection/',
  '/search',
  '/wp-json',
  '.pdf',
  '.jpg',
  '.png',
  '.gif',
];

const INCLUDE_PATH_FRAGMENTS = [
  '/blog/',
  '/article/',
  '/articles/',
  '/post/',
  '/posts/',
  '/news/',
  '/guides/',
  '/guide/',
  '/learn/',
  '/insights/',
  '/resources/',
  '/stories/',
  '/tips/',
  '/how-to',
  '/howto/',
];

function parseHttpUrl(url: string): { host: string; path: string } | null {
  const match = url.trim().match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
  if (!match) {
    return null;
  }
  return {
    host: match[1].toLowerCase(),
    path: (match[2] || '/').toLowerCase(),
  };
}

/** 判断 URL 是否像 SEO 资讯/博客文章页（非产品、首页、登录等） */
export function isSeoArticleUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return false;
  }

  const { host, path } = parsed;

  if (EXCLUDE_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) {
    return false;
  }
  if (EXCLUDE_PATH_FRAGMENTS.some((fragment) => path.includes(fragment))) {
    return false;
  }
  if (path === '/' || path === '') {
    return false;
  }
  if (INCLUDE_PATH_FRAGMENTS.some((fragment) => path.includes(fragment))) {
    return true;
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const slug = segments[segments.length - 1];
    if (slug.length > 12 && slug.includes('-')) {
      return true;
    }
  }

  return false;
}

/** 从文章 URL 提取可用作关键词的 slug 文本 */
export function keywordFromArticleUrl(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return url;
  }

  try {
    const segments = parsed.path.split('/').filter(Boolean);
    const slug = segments[segments.length - 1] ?? '';
    const normalized = slug
      .replace(/\.(html?|php|aspx)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return normalized.length >= 2 ? normalized : url;
  } catch {
    return url;
  }
}

/** 过滤 SERP 有机结果，仅保留 SEO 文章类竞品并限制条数 */
export function filterSerpOrganicForSeoArticles(
  organic: SerpOrganicItem[],
  options: { limit: number; articlesOnly: boolean },
): { filtered: SerpOrganicItem[]; meta: SerpOrganicFilterMeta } {
  const total = organic.length;
  let candidates = organic;

  if (options.articlesOnly) {
    candidates = organic.filter((item) => item.link && isSeoArticleUrl(item.link));
  }

  const safeLimit = Math.max(1, options.limit);
  const filtered = candidates.slice(0, safeLimit);

  return {
    filtered,
    meta: {
      total,
      kept: filtered.length,
      excluded: total - filtered.length,
      articlesOnly: options.articlesOnly,
      limit: safeLimit,
    },
  };
}
