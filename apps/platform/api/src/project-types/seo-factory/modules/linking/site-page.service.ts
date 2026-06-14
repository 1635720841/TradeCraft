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
import { SiteArticleCrawlerService } from '../site/site-article-crawler.service';
import { inferPageTypeFromUrl, titleFromUrl, type SitePageCandidate } from './link-match.util';

const DEFAULT_SYNC_LIMIT = 200;

@Injectable()
export class SitePageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteArticleCrawler: SiteArticleCrawlerService,
    private readonly logger: LoggerService,
  ) {}

  async listForSite(organizationId: string, projectId: string, siteId: string) {
    await this.assertSiteExists(organizationId, projectId, siteId);

    return this.prisma.sitePage.findMany({
      where: { organizationId, projectId, siteId },
      select: {
        id: true,
        url: true,
        title: true,
        summary: true,
        keywords: true,
        pageType: true,
        businessValue: true,
        lastUpdated: true,
        source: true,
        updatedAt: true,
      },
      orderBy: [{ businessValue: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async syncFromSitemap(organizationId: string, projectId: string, siteId: string, limit = DEFAULT_SYNC_LIMIT) {
    await this.assertSiteExists(organizationId, projectId, siteId);

    const discovered = await this.siteArticleCrawler.discoverForSite(organizationId, projectId, siteId, {
      limit,
      seoArticlesOnly: false,
    });

    let upserted = 0;
    for (const item of discovered) {
      const pageType = inferPageTypeFromUrl(item.url) as SitePageType;
      const title = titleFromUrl(item.url, item.keyword);
      const businessValue = pageType === 'PRODUCT' || pageType === 'SERVICE' ? 0.85 : 0.65;

      await this.prisma.sitePage.upsert({
        where: { siteId_url: { siteId, url: item.url } },
        create: {
          organizationId,
          projectId,
          siteId,
          url: item.url,
          title,
          keywords: item.keyword ? [item.keyword] : [],
          pageType,
          businessValue,
          source: 'sitemap',
        },
        update: {
          title,
          keywords: item.keyword ? [item.keyword] : [],
          pageType,
          businessValue,
          source: 'sitemap',
        },
      });
      upserted += 1;
    }

    this.logger.info('Site pages synced from sitemap', {
      organizationId,
      projectId,
      siteId,
      action: 'site_page.sync',
      discovered: discovered.length,
      upserted,
    });

    return { discovered: discovered.length, upserted };
  }

  async loadCandidates(
    organizationId: string,
    projectId: string,
    siteId: string,
    excludeUrls: string[] = [],
  ): Promise<SitePageCandidate[]> {
    const exclude = new Set(excludeUrls.map((url) => url.trim()).filter(Boolean));
    const rows = await this.prisma.sitePage.findMany({
      where: { organizationId, projectId, siteId },
      select: {
        url: true,
        title: true,
        summary: true,
        keywords: true,
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
        pageType: row.pageType,
        businessValue: row.businessValue,
      }));
  }

  private async assertSiteExists(organizationId: string, projectId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { id: true },
    });
    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }
  }
}
