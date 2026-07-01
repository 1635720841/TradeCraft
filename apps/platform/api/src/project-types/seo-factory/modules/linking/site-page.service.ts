/**
 * 站点页面库：从 sitemap 同步、查询可内链页面。
 *
 * 边界：
 * - 不负责：内链植入（LinkingService）
 *
 * 入口：
 * - SitePageService
 */

import { Injectable } from '@nestjs/common';
import { SitePageType } from '@prisma/client';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { assertSiteScope } from '../../utils/assert-site-scope.util';
import { SiteArticleCrawlerService } from '../site/site-article-crawler.service';
import {
  DEFAULT_SITE_PAGE_LIBRARY_SYNC_LIMIT,
  MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT,
} from '../../constants/serp-filter';
import { inferPageTypeFromUrl, titleFromUrl, type SitePageCandidate } from './link-match.util';
import { resolveSitePageBusinessValue } from './site-page-sync.util';

import { keywordFromArticleUrl } from '@wm/shared-core';

const SITE_PAGE_LIST_MAX_LIMIT = 100;

const sitePageSelect = {
  id: true,
  url: true,
  title: true,
  summary: true,
  keywords: true,
  primaryKeyword: true,
  pageType: true,
  businessValue: true,
  lastUpdated: true,
  active: true,
  source: true,
  updatedAt: true,
} as const;

export interface SitePageSyncStats {
  discovered: number;
  upserted: number;
  skipped: number;
  deactivated: number;
  reactivated: number;
}

@Injectable()
export class SitePageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteArticleCrawler: SiteArticleCrawlerService,
    private readonly logger: LoggerService,
  ) {}

  async listForSite(
    organizationId: string,
    projectId: string,
    siteId: string,
    options: { page?: number; limit?: number; includeInactive?: boolean } = {},
  ) {
    await assertSiteScope(this.prisma, organizationId, projectId, siteId);

    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), SITE_PAGE_LIST_MAX_LIMIT);
    const skip = (page - 1) * limit;
    const where = {
      organizationId,
      projectId,
      siteId,
      ...(options.includeInactive ? {} : { active: true }),
    };

    const [items, total] = await Promise.all([
      this.prisma.sitePage.findMany({
        where,
        select: sitePageSelect,
        orderBy: [{ businessValue: 'desc' }, { lastUpdated: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.sitePage.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async syncFromSitemap(
    organizationId: string,
    projectId: string,
    siteId: string,
    limit = DEFAULT_SITE_PAGE_LIBRARY_SYNC_LIMIT,
  ): Promise<SitePageSyncStats> {
    await assertSiteScope(this.prisma, organizationId, projectId, siteId);

    const syncLimit = Math.min(Math.max(limit, 1), MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT);
    const allEntries = await this.siteArticleCrawler.fetchAllSitemapEntriesForSite(
      organizationId,
      projectId,
      siteId,
    );
    const discovered = allEntries.length;
    const toUpsert = allEntries.slice(0, syncLimit);
    const skipped = Math.max(0, discovered - toUpsert.length);
    const sitemapUrlSet = new Set(allEntries.map((entry) => entry.url));

    const existingRows = await this.prisma.sitePage.findMany({
      where: { siteId, url: { in: toUpsert.map((item) => item.url) } },
      select: { url: true, primaryKeyword: true, active: true },
    });
    const existingByUrl = new Map(
      existingRows.map((row) => [
        row.url,
        { primaryKeyword: row.primaryKeyword?.trim() || null, active: row.active },
      ]),
    );

    let upserted = 0;
    let reactivated = 0;

    for (const item of toUpsert) {
      const pageType = inferPageTypeFromUrl(item.url) as SitePageType;
      const keyword = keywordFromArticleUrl(item.url)?.trim() || null;
      const title = titleFromUrl(item.url, keyword ?? undefined);
      const businessValue = resolveSitePageBusinessValue(pageType, item.priority);
      const existing = existingByUrl.get(item.url);
      const primaryKeyword = existing?.primaryKeyword || keyword;
      const wasInactive = existing?.active === false;

      await this.prisma.sitePage.upsert({
        where: { siteId_url: { siteId, url: item.url } },
        create: {
          organizationId,
          projectId,
          siteId,
          url: item.url,
          title,
          keywords: keyword ? [keyword] : [],
          primaryKeyword: keyword,
          pageType,
          businessValue,
          lastUpdated: item.lastmod,
          active: true,
          source: 'sitemap',
        },
        update: {
          title,
          keywords: keyword ? [keyword] : [],
          primaryKeyword,
          pageType,
          businessValue,
          lastUpdated: item.lastmod ?? undefined,
          active: true,
          source: 'sitemap',
        },
      });

      upserted += 1;
      if (wasInactive) {
        reactivated += 1;
      }
    }

    const deactivateResult =
      discovered > 0
        ? await this.prisma.sitePage.updateMany({
            where: {
              organizationId,
              projectId,
              siteId,
              active: true,
              source: 'sitemap',
              url: { notIn: [...sitemapUrlSet] },
            },
            data: { active: false },
          })
        : { count: 0 };

    const stats: SitePageSyncStats = {
      discovered,
      upserted,
      skipped,
      deactivated: deactivateResult.count,
      reactivated,
    };

    this.logger.info('Site pages synced from sitemap', {
      organizationId,
      projectId,
      siteId,
      action: 'site_page.sync',
      ...stats,
    });

    return stats;
  }

  /** 创建站点后后台自动同步页面库（失败仅记日志，不抛出） */
  async tryAutoSyncFromSitemap(params: {
    organizationId: string;
    projectId: string;
    siteId: string;
    domain: string;
  }): Promise<void> {
    try {
      const stats = await this.syncFromSitemap(
        params.organizationId,
        params.projectId,
        params.siteId,
      );
      this.logger.info('Site page library auto-sync completed', {
        organizationId: params.organizationId,
        projectId: params.projectId,
        siteId: params.siteId,
        domain: params.domain,
        action: 'site_page.auto_sync',
        ...stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '页面库自动同步失败';
      this.logger.warn('Site page library auto-sync failed', {
        organizationId: params.organizationId,
        projectId: params.projectId,
        siteId: params.siteId,
        domain: params.domain,
        action: 'site_page.auto_sync_failed',
        error: message,
      });
    }
  }

  async patchPage(
    organizationId: string,
    projectId: string,
    siteId: string,
    pageId: string,
    primaryKeyword?: string | null,
  ) {
    await assertSiteScope(this.prisma, organizationId, projectId, siteId);

    const page = await this.prisma.sitePage.findFirst({
      where: { id: pageId, organizationId, projectId, siteId },
      select: { id: true },
    });

    if (!page) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '页面不存在');
    }

    return this.prisma.sitePage.update({
      where: { id: pageId },
      data: {
        primaryKeyword:
          primaryKeyword === undefined
            ? undefined
            : primaryKeyword?.trim() || null,
      },
      select: sitePageSelect,
    });
  }

  async loadCandidates(
    organizationId: string,
    projectId: string,
    siteId: string,
    excludeUrls: string[] = [],
  ): Promise<SitePageCandidate[]> {
    const exclude = new Set(excludeUrls.map((url) => url.trim()).filter(Boolean));
    const rows = await this.prisma.sitePage.findMany({
      where: { organizationId, projectId, siteId, active: true },
      select: {
        url: true,
        title: true,
        summary: true,
        keywords: true,
        primaryKeyword: true,
        pageType: true,
        businessValue: true,
      },
      orderBy: [{ businessValue: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });

    return rows
      .filter((row) => !exclude.has(row.url))
      .map((row) => ({
        url: row.url,
        title: row.title,
        summary: row.summary,
        keywords: row.keywords,
        primaryKeyword: row.primaryKeyword,
        pageType: row.pageType,
        businessValue: row.businessValue,
      }));
  }
}

