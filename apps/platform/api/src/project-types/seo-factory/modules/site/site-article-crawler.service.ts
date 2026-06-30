/**
 * 站点 SEO 文章采集：从 sitemap 发现博客/资讯类 URL。
 *
 * 边界：
 * - 不负责：正文抓取、任务入队（ArticleJobService）
 *
 * 入口：
 * - SiteArticleCrawlerService
 */

import { Injectable } from '@nestjs/common';
import { isSeoArticleUrl, keywordFromArticleUrl } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  DEFAULT_SITE_CRAWL_LIMIT,
  MAX_SITE_CRAWL_LIMIT,
} from '../../constants/serp-filter';
import {
  extractChildSitemapLocs,
  parseSitemapUrlEntries,
  type SitemapUrlEntry,
} from './sitemap-parse.util';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_FETCH = 8;

export interface DiscoveredSeoArticle {
  url: string;
  keyword: string;
  lastmod?: Date | null;
  sitemapPriority?: number | null;
}

export interface DiscoverSeoArticlesOptions {
  limit?: number;
  /** 覆盖默认 MAX_SITE_CRAWL_LIMIT（页面库同步等场景需更高上限） */
  maxLimit?: number;
  seoArticlesOnly?: boolean;
}

@Injectable()
export class SiteArticleCrawlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async discoverForSite(
    organizationId: string,
    projectId: string,
    siteId: string,
    options: DiscoverSeoArticlesOptions = {},
  ): Promise<DiscoveredSeoArticle[]> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { id: true, domain: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const cap = options.maxLimit ?? MAX_SITE_CRAWL_LIMIT;
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_SITE_CRAWL_LIMIT, 1), cap);
    const articlesOnly = options.seoArticlesOnly !== false;

    const entries = await this.fetchSitemapEntries(site.domain);
    const candidates = articlesOnly
      ? entries.filter((entry) => isSeoArticleUrl(entry.url))
      : entries;
    const selected = candidates.slice(0, limit).map((entry) => ({
      url: entry.url,
      keyword: keywordFromArticleUrl(entry.url),
      lastmod: entry.lastmod,
      sitemapPriority: entry.priority,
    }));

    this.logger.info('Site SEO articles discovered', {
      organizationId,
      projectId,
      siteId,
      action: 'site.discover_seo_articles',
      totalUrls: entries.length,
      kept: selected.length,
      articlesOnly,
      limit,
    });

    return selected;
  }

  /** 抓取站点 sitemap 全量 URL 条目（含 lastmod / priority，不做条数截断） */
  async fetchAllSitemapEntriesForSite(
    organizationId: string,
    projectId: string,
    siteId: string,
  ): Promise<SitemapUrlEntry[]> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { id: true, domain: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    return this.fetchSitemapEntries(site.domain);
  }

  private async fetchSitemapEntries(domain: string): Promise<SitemapUrlEntry[]> {
    const hosts = [domain.replace(/^https?:\/\//i, '').replace(/\/$/, '')];
    if (!hosts[0].startsWith('www.')) {
      hosts.push(`www.${hosts[0]}`);
    }

    for (const host of hosts) {
      const root = `https://${host}`;
      const fromRoot = await this.collectFromSitemap(`${root}/sitemap.xml`, 0);
      if (fromRoot.length > 0) {
        return this.dedupeSitemapEntries(fromRoot);
      }
      const fromIndex = await this.collectFromSitemap(`${root}/sitemap_index.xml`, 0);
      if (fromIndex.length > 0) {
        return this.dedupeSitemapEntries(fromIndex);
      }
    }

    return [];
  }

  private dedupeSitemapEntries(entries: SitemapUrlEntry[]): SitemapUrlEntry[] {
    const byUrl = new Map<string, SitemapUrlEntry>();
    for (const entry of entries) {
      const existing = byUrl.get(entry.url);
      if (!existing) {
        byUrl.set(entry.url, entry);
        continue;
      }

      byUrl.set(entry.url, {
        url: entry.url,
        lastmod: entry.lastmod ?? existing.lastmod,
        priority: entry.priority ?? existing.priority,
      });
    }
    return [...byUrl.values()];
  }

  private async collectFromSitemap(url: string, depth: number): Promise<SitemapUrlEntry[]> {
    if (depth > 1) {
      return [];
    }

    const xml = await this.fetchText(url);
    if (!xml) {
      return [];
    }

    const pageEntries = parseSitemapUrlEntries(xml);
    const childSitemaps = extractChildSitemapLocs(xml);

    const childResults = await Promise.all(
      childSitemaps.slice(0, MAX_SITEMAP_FETCH).map((child) => this.collectFromSitemap(child, depth + 1)),
    );

    return [...pageEntries, ...childResults.flat()];
  }

  private async fetchText(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'wm-seo-factory/1.0' },
      });
      if (!response.ok) {
        return null;
      }
      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
