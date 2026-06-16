/**
 * 竞品页面抓取：受控并发 HTTP + 轻量 HTML 解析。
 *
 * 边界：
 * - 不负责：Serper 查询（ScraperService.researchSerp 前置步骤）
 *
 * 入口：
 * - CompetitorPageScraper
 */

import { Injectable } from '@nestjs/common';
import {
  normalizeCompetitorUrl,
  parseCompetitorPageHtml,
  type SerpOrganicItem,
  type SerpOrganicScrapedMeta,
} from '@wm/shared-core';
import { LoggerService } from '../../../../core/logger/logger.service';
import { buildProxyHint, fetchWithRetry } from '../../../../core/http/http-fetch';
import {
  buildCompetitorScrapeHeaders,
  isCompetitorScrapeEnabled,
  readCompetitorScrapeOptions,
} from '../../constants/scraper.config';
import {
  isCompetitorBrowserFallbackEnabled,
  scrapeCompetitorPageWithBrowser,
} from './competitor-browser.scraper';

export interface CompetitorScrapeMeta {
  requested: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

const MIN_USABLE_WORD_COUNT = 50;

@Injectable()
export class CompetitorPageScraper {
  private readonly options = readCompetitorScrapeOptions();

  constructor(private readonly logger: LoggerService) {}

  async enrichOrganicItems(
    items: SerpOrganicItem[],
    meta: { traceId: string; jobId: string },
  ): Promise<{ items: SerpOrganicItem[]; scrapeMeta: CompetitorScrapeMeta }> {
    if (!isCompetitorScrapeEnabled()) {
      return {
        items,
        scrapeMeta: {
          requested: 0,
          succeeded: 0,
          failed: 0,
          skipped: true,
        },
      };
    }

    const targets = items.filter((item) => typeof item.link === 'string' && item.link.startsWith('http'));
    const scrapedByUrl = await this.scrapeUrls(
      targets.map((item) => item.link!),
      meta,
    );

    let succeeded = 0;
    let failed = 0;

    const enriched = items.map((item) => {
      if (!item.link) return item;
      const scraped = this.lookupScraped(scrapedByUrl, item.link);
      if (!scraped) {
        failed += 1;
        return {
          ...item,
          scraped: {
            wordCount: 0,
            headings: [],
            excerpt: '',
            scrapedAt: new Date().toISOString(),
            error: '未返回抓取结果',
          },
        };
      }
      if (scraped.error) {
        failed += 1;
      } else {
        succeeded += 1;
      }
      return { ...item, scraped };
    });

    return {
      items: enriched,
      scrapeMeta: {
        requested: targets.length,
        succeeded,
        failed,
        skipped: false,
      },
    };
  }

  private lookupScraped(
    map: Map<string, SerpOrganicScrapedMeta>,
    link: string,
  ): SerpOrganicScrapedMeta | undefined {
    return map.get(link) ?? map.get(normalizeCompetitorUrl(link));
  }

  private async scrapeUrls(
    urls: string[],
    meta: { traceId: string; jobId: string },
  ): Promise<Map<string, SerpOrganicScrapedMeta>> {
    const uniqueUrls = [...new Set(urls)];
    const results = await mapWithConcurrency(uniqueUrls, this.options.concurrency, (url) =>
      this.scrapeSingleUrl(url),
    );

    const map = new Map<string, SerpOrganicScrapedMeta>();
    uniqueUrls.forEach((url, index) => {
      const result = results[index];
      map.set(url, result);
      map.set(normalizeCompetitorUrl(url), result);
    });

    this.logger.info('Competitor pages scraped', {
      traceId: meta.traceId,
      jobId: meta.jobId,
      action: 'scraper.competitor_pages',
      requested: uniqueUrls.length,
      succeeded: results.filter((item) => !item.error).length,
      failed: results.filter((item) => item.error).length,
    });

    return map;
  }

  private async scrapeSingleUrl(url: string): Promise<SerpOrganicScrapedMeta> {
    const scrapedAt = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

      try {
        const response = await fetchWithRetry(
          url,
          {
            method: 'GET',
            redirect: 'follow',
            headers: buildCompetitorScrapeHeaders(this.options.userAgent),
            signal: controller.signal,
          },
          { label: 'CompetitorPage', maxRetries: this.options.fetchMaxRetries },
        );

        if (!response.ok) {
          return {
            wordCount: 0,
            headings: [],
            excerpt: '',
            scrapedAt,
            error: `HTTP ${response.status}`,
          };
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
          return {
            wordCount: 0,
            headings: [],
            excerpt: '',
            scrapedAt,
            error: `非 HTML 页面（${contentType || 'unknown'}）`,
          };
        }

        const html = await response.text();
        const parsed = parseCompetitorPageHtml(html, {
          maxChars: this.options.maxChars,
          maxHeadings: this.options.maxHeadings,
        });

        if (parsed.wordCount < MIN_USABLE_WORD_COUNT && parsed.headings.length === 0) {
          const browserParsed = await this.tryBrowserFallback(url);
          if (browserParsed && !browserParsed.error) {
            if (
              browserParsed.wordCount >= MIN_USABLE_WORD_COUNT ||
              browserParsed.headings.length > 0
            ) {
              return { ...browserParsed, scrapedAt };
            }
          }

          return {
            ...parsed,
            scrapedAt,
            error: '页面正文过少（可能被反爬或需 JavaScript 渲染）',
          };
        }

        return { ...parsed, scrapedAt };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const browserParsed = await this.tryBrowserFallback(url);
      if (browserParsed && !browserParsed.error) {
        return { ...browserParsed, scrapedAt };
      }

      const message = error instanceof Error ? error.message : '抓取失败';
      const hint = buildProxyHint(error);
      return {
        wordCount: 0,
        headings: [],
        excerpt: '',
        scrapedAt,
        error: `${message}${hint}`,
      };
    }
  }

  private async tryBrowserFallback(url: string) {
    if (!isCompetitorBrowserFallbackEnabled()) return null;

    const parsed = await scrapeCompetitorPageWithBrowser(url, {
      timeoutMs: this.options.timeoutMs,
      maxChars: this.options.maxChars,
      maxHeadings: this.options.maxHeadings,
    });

    if (parsed.error) {
      this.logger.warn('Competitor browser fallback failed', {
        url,
        error: parsed.error,
        action: 'scraper.competitor_browser_fallback',
      });
      return null;
    }

    return parsed;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}
