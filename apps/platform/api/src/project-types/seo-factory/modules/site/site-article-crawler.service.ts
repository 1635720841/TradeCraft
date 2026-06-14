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

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_FETCH = 8;

export interface DiscoveredSeoArticle {
  url: string;
  keyword: string;
}

export interface DiscoverSeoArticlesOptions {
  limit?: number;
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

    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_SITE_CRAWL_LIMIT, 1),
      MAX_SITE_CRAWL_LIMIT,
    );
    const articlesOnly = options.seoArticlesOnly !== false;

    const urls = await this.fetchSitemapUrls(site.domain);
    const candidates = articlesOnly ? urls.filter((url) => isSeoArticleUrl(url)) : urls;
    const selected = candidates.slice(0, limit).map((url) => ({
      url,
      keyword: keywordFromArticleUrl(url),
    }));

    this.logger.info('Site SEO articles discovered', {
      organizationId,
      projectId,
      siteId,
      action: 'site.discover_seo_articles',
      totalUrls: urls.length,
      kept: selected.length,
      articlesOnly,
      limit,
    });

    return selected;
  }

  private async fetchSitemapUrls(domain: string): Promise<string[]> {
    const hosts = [domain.replace(/^https?:\/\//i, '').replace(/\/$/, '')];
    if (!hosts[0].startsWith('www.')) {
      hosts.push(`www.${hosts[0]}`);
    }

    for (const host of hosts) {
      const root = `https://${host}`;
      const fromRoot = await this.collectFromSitemap(`${root}/sitemap.xml`, 0);
      if (fromRoot.length > 0) {
        return [...new Set(fromRoot)];
      }
      const fromIndex = await this.collectFromSitemap(`${root}/sitemap_index.xml`, 0);
      if (fromIndex.length > 0) {
        return [...new Set(fromIndex)];
      }
    }

    return [];
  }

  private async collectFromSitemap(url: string, depth: number): Promise<string[]> {
    if (depth > 1) {
      return [];
    }

    const xml = await this.fetchText(url);
    if (!xml) {
      return [];
    }

    const locs = this.extractLocs(xml);
    const pageUrls: string[] = [];
    const childSitemaps: string[] = [];

    for (const loc of locs) {
      if (/sitemap.*\.xml$/i.test(loc)) {
        childSitemaps.push(loc);
      } else {
        pageUrls.push(loc);
      }
    }

    const childResults = await Promise.all(
      childSitemaps.slice(0, MAX_SITEMAP_FETCH).map((child) => this.collectFromSitemap(child, depth + 1)),
    );

    return [...pageUrls, ...childResults.flat()];
  }

  private extractLocs(xml: string): string[] {
    return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim());
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
