/**
 * 竞品 SERP 分析摘要：字数统计、H 结构、与大纲目标字数对照。
 *
 * 边界：
 * - 不负责：HTTP 抓取（Scraper 模块）
 */

import type { SerpOrganicScrapedMeta } from './competitor-page.util';

export interface CompetitorSerpOrganicItem {
  link?: string;
  title?: string;
  snippet?: string;
  position?: number;
  scraped?: SerpOrganicScrapedMeta;
}

export interface CompetitorScrapeBatchMeta {
  requested: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

export interface CompetitorRowSummary {
  position: number;
  title: string;
  link: string;
  snippet?: string;
  wordCount: number | null;
  headingCount: number;
  headings: string[];
  excerpt: string | null;
  scrapeError?: string;
  scraped: boolean;
}

export interface CompetitorAnalysisSummary {
  total: number;
  scrapedCount: number;
  scrapeFailedCount: number;
  scrapeSkipped: boolean;
  /** 去重后的抓取失败原因（最多 3 条） */
  scrapeErrorSamples: string[];
  avgWordCount: number | null;
  minWordCount: number | null;
  maxWordCount: number | null;
  medianWordCount: number | null;
  targetWordCount: number | null;
  /** 与大纲目标字数对照的一句话提示 */
  wordCountHint: string | null;
  rows: CompetitorRowSummary[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function roundAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function buildWordCountHint(
  targetWordCount: number | null | undefined,
  medianWordCount: number | null,
  avgWordCount: number | null,
): string | null {
  if (targetWordCount == null) return null;
  const benchmark = medianWordCount ?? avgWordCount;
  if (benchmark == null) return `大纲目标约 ${targetWordCount} 词（竞品字数待抓取）`;
  const diff = targetWordCount - benchmark;
  if (Math.abs(diff) <= Math.max(80, benchmark * 0.08)) {
    return `大纲目标 ${targetWordCount} 词，与竞品中位 ${benchmark} 词接近`;
  }
  if (diff > 0) {
    return `大纲目标 ${targetWordCount} 词，高于竞品中位 ${benchmark} 词（+${diff}）`;
  }
  return `大纲目标 ${targetWordCount} 词，低于竞品中位 ${benchmark} 词（${diff}）`;
}

export function summarizeCompetitorSerp(
  organic: CompetitorSerpOrganicItem[] | null | undefined,
  options: {
    targetWordCount?: number | null;
    scrapeMeta?: CompetitorScrapeBatchMeta | null;
  } = {},
): CompetitorAnalysisSummary {
  const items = organic ?? [];
  const scrapeMeta = options.scrapeMeta ?? null;

  let scrapedCount = 0;
  let scrapeFailedCount = 0;

  const rows: CompetitorRowSummary[] = items.map((item, index) => {
    const scraped = item.scraped;
    const hasScrape = Boolean(scraped && !scraped.error && scraped.wordCount > 0);
    if (scraped?.error) scrapeFailedCount += 1;
    else if (item.link && !hasScrape) scrapeFailedCount += 1;
    if (hasScrape) scrapedCount += 1;

    return {
      position: item.position ?? index + 1,
      title: item.title?.trim() || '（无标题）',
      link: item.link?.trim() || '',
      snippet: item.snippet,
      wordCount: hasScrape ? scraped!.wordCount : null,
      headingCount: hasScrape ? scraped!.headings.length : 0,
      headings: hasScrape ? scraped!.headings : [],
      excerpt: hasScrape && scraped!.excerpt ? scraped!.excerpt : null,
      scrapeError: scraped?.error,
      scraped: hasScrape,
    };
  });

  const wordCounts = rows
    .map((row) => row.wordCount)
    .filter((n): n is number => typeof n === 'number' && n > 0);

  const targetWordCount = options.targetWordCount ?? null;
  const medianWordCount = median(wordCounts);
  const avgWordCount = roundAvg(wordCounts);
  const scrapeErrorSamples = [
    ...new Set(rows.map((row) => row.scrapeError).filter((msg): msg is string => Boolean(msg))),
  ].slice(0, 3);

  return {
    total: items.length,
    // `organic` contains accepted analysis samples. Batch `succeeded` may be
    // higher because the scraper fetches replacement candidates as well.
    scrapedCount,
    scrapeFailedCount: scrapeMeta?.failed ?? scrapeFailedCount,
    scrapeSkipped: scrapeMeta?.skipped === true,
    scrapeErrorSamples,
    avgWordCount,
    minWordCount: wordCounts.length ? Math.min(...wordCounts) : null,
    maxWordCount: wordCounts.length ? Math.max(...wordCounts) : null,
    medianWordCount,
    targetWordCount,
    wordCountHint: buildWordCountHint(targetWordCount, medianWordCount, avgWordCount),
    rows,
  };
}
