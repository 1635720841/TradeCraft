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
}

export function isCompetitorScrapeEnabled(): boolean {
  return process.env.SCRAPER_COMPETITOR_ENABLED !== 'false';
}

export function readCompetitorScrapeOptions(): CompetitorScrapeOptions {
  return {
    concurrency: parsePositiveInt(process.env.SCRAPER_COMPETITOR_CONCURRENCY, 2),
    timeoutMs: parsePositiveInt(process.env.SCRAPER_COMPETITOR_TIMEOUT_MS, 15_000),
    maxChars: parsePositiveInt(process.env.SCRAPER_COMPETITOR_MAX_CHARS, 8000),
    maxHeadings: parsePositiveInt(process.env.SCRAPER_COMPETITOR_MAX_HEADINGS, 20),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
