/**
 * 竞品 SERP 页面正文抓取：受控并发 HTTP + 轻量 HTML 解析。
 *
 * 边界：
 * - 不负责：Serper 查询（ScraperService.researchSerp 前置步骤）
 *
 * 入口：
 * - CompetitorPageScraper
 */

import { Injectable } from '@nestjs/common';
import {
  parseCompetitorPageHtml,
  type SerpOrganicItem,
  type SerpOrganicScrapedMeta,
} from '@wm/shared-core';
import { LoggerService } from '../../../../core/logger/logger.service';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import {
  isCompetitorScrapeEnabled,
  readCompetitorScrapeOptions,
} from '../../constants/scraper.config';

export interface CompetitorScrapeMeta {
  requested: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

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
      const scraped = scrapedByUrl.get(item.link);
      if (!scraped) return item;
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
      map.set(url, results[index]);
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
            headers: {
              'User-Agent': 'wm-seo-factory/1.0 (+https://wm.local/competitor-research)',
              Accept: 'text/html,application/xhtml+xml',
            },
            signal: controller.signal,
          },
          { label: 'CompetitorPage', maxRetries: 1 },
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

        const html = await response.text();
        const parsed = parseCompetitorPageHtml(html, {
          maxChars: this.options.maxChars,
          maxHeadings: this.options.maxHeadings,
        });

        return { ...parsed, scrapedAt };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '抓取失败';
      return {
        wordCount: 0,
        headings: [],
        excerpt: '',
        scrapedAt,
        error: message,
      };
    }
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
