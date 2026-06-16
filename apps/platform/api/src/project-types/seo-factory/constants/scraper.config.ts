/**
 * 竞品页面抓取配置。
 *
 * 边界：
 * - 不负责：Serper 请求（SerperAdapter）
 *
 * 入口：
 * - isCompetitorScrapeEnabled / readCompetitorScrapeOptions
 */

export interface CompetitorScrapeOptions {
  concurrency: number;
  timeoutMs: number;
  maxChars: number;
  maxHeadings: number;
  userAgent: string;
  fetchMaxRetries: number;
}

export const DEFAULT_COMPETITOR_SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function isCompetitorScrapeEnabled(): boolean {
  return process.env.SCRAPER_COMPETITOR_ENABLED !== 'false';
}

export function readCompetitorScrapeOptions(): CompetitorScrapeOptions {
  return {
    concurrency: parsePositiveInt(process.env.SCRAPER_COMPETITOR_CONCURRENCY, 2),
    timeoutMs: parsePositiveInt(process.env.SCRAPER_COMPETITOR_TIMEOUT_MS, 20_000),
    maxChars: parsePositiveInt(process.env.SCRAPER_COMPETITOR_MAX_CHARS, 8000),
    maxHeadings: parsePositiveInt(process.env.SCRAPER_COMPETITOR_MAX_HEADINGS, 20),
    userAgent:
      process.env.SCRAPER_COMPETITOR_USER_AGENT?.trim() || DEFAULT_COMPETITOR_SCRAPE_USER_AGENT,
    fetchMaxRetries: parsePositiveInt(process.env.SCRAPER_COMPETITOR_FETCH_RETRIES, 3),
  };
}

export function buildCompetitorScrapeHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
