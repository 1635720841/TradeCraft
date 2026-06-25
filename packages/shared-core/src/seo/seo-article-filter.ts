/**
 * SEO 文章页识别与 SERP 有机结果过滤。
 *
 * 边界：
 * - 不负责：页面正文抓取（由 Scraper / Site 模块处理）
 */

import type { SerpOrganicScrapedMeta } from './competitor-page.util';

export type { SerpOrganicScrapedMeta };

export interface SerpOrganicItem {
  position?: number;
  title?: string;
  snippet?: string;
  link?: string;
  scraped?: SerpOrganicScrapedMeta;
}

export interface SerpOrganicFilterMeta {
  total: number;
  kept: number;
  excluded: number;
  articlesOnly: boolean;
  limit: number;
  /** 识别为博客/资讯文的条数 */
  articleKept?: number;
  /** 为凑够样本从其余搜索结果回补的条数 */
  backfillKept?: number;
  /** Excluded because the result is a forum, Q&A, community, or other non-article page. */
  nonArticleExcluded?: number;
  /** Excluded after the competitor body could not be fetched or parsed. */
  scrapeFailedExcluded?: number;
}

/** A competitor sample is analyzable only when body scraping produced usable content. */
export function isUsableCompetitorSample<T extends { scraped?: { wordCount?: number; error?: string } }>(
  item: T,
): boolean {
  const scraped = item.scraped;
  return Boolean(
    scraped &&
      !scraped.error &&
      typeof scraped.wordCount === 'number' &&
      scraped.wordCount > 0,
  );
}

export function filterUsableCompetitorSamples<
  T extends { scraped?: { wordCount?: number; error?: string } },
>(items: T[]): T[] {
  return items.filter(isUsableCompetitorSample);
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
  'quora.com',
  'stackoverflow.com',
  'stackexchange.com',
  'answers.',
  'forum.',
  'forums.',
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
  '/service/',
  '/services/',
  '/solution/',
  '/solutions/',
  '/search',
  '/wp-json',
  '/forum/',
  '/forums/',
  '/thread/',
  '/threads/',
  '/topic/',
  '/topics/',
  '/community/',
  '/questions/',
  '/answers/',
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

const NON_ARTICLE_TITLE_PATTERN =
  /(?:\||-|\u2013|\u2014)\s*[^|\u2013\u2014]*\b(?:forums?|community|discussion board|q\s*&\s*a)\s*$/i;

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

function isHardExcludedUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return true;
  }

  const { host, path } = parsed;
  if (EXCLUDE_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) {
    return true;
  }
  if (EXCLUDE_PATH_FRAGMENTS.some((fragment) => path.includes(fragment))) {
    return true;
  }
  return false;
}

/** 判断 URL 是否像 SEO 资讯/博客文章页（非产品、首页、登录等） */
export function isSeoArticleUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return false;
  }

  const { path } = parsed;

  if (isHardExcludedUrl(url)) {
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

/** SERP-level article check, including title signals that are not available from the URL alone. */
export function isStandardSeoArticleCandidate(item: SerpOrganicItem): boolean {
  if (!item.link || !isSeoArticleUrl(item.link)) {
    return false;
  }

  const title = item.title?.trim() ?? '';
  return !NON_ARTICLE_TITLE_PATTERN.test(title);
}

/** 博客类不足时，可回补的其它搜索结果（仅供显式放宽筛选的旧调用兼容）。 */
export function isUsefulSerpFallbackUrl(url: string): boolean {
  if (!url.trim() || isHardExcludedUrl(url) || isSeoArticleUrl(url)) {
    return false;
  }

  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return false;
  }

  const { path } = parsed;
  return path !== '/' && path !== '';
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

/** 过滤 SERP 有机结果，优先保留 SEO 文章类竞品；不足时自动回补 */
export function filterSerpOrganicForSeoArticles(
  organic: SerpOrganicItem[],
  options: {
    limit: number;
    articlesOnly: boolean;
    minArticleCandidates?: number;
  },
): { filtered: SerpOrganicItem[]; meta: SerpOrganicFilterMeta } {
  const total = organic.length;
  const safeLimit = Math.max(1, options.limit);
  if (!options.articlesOnly) {
    const filtered = organic.slice(0, safeLimit);
    return {
      filtered,
      meta: {
        total,
        kept: filtered.length,
        excluded: total - filtered.length,
        articlesOnly: false,
        limit: safeLimit,
        articleKept: filtered.length,
        backfillKept: 0,
        nonArticleExcluded: 0,
        scrapeFailedExcluded: 0,
      },
    };
  }

  const articleCandidates = organic.filter(isStandardSeoArticleCandidate);
  const kept: SerpOrganicItem[] = articleCandidates.slice(0, safeLimit);

  return {
    filtered: kept,
    meta: {
      total,
      kept: kept.length,
      excluded: total - kept.length,
      articlesOnly: true,
      limit: safeLimit,
      articleKept: kept.length,
      backfillKept: 0,
      nonArticleExcluded: total - articleCandidates.length,
      scrapeFailedExcluded: 0,
    },
  };
}
