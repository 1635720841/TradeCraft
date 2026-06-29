/**
 * Google Search Console 连接、OAuth 与数据同步。
 *
 * 边界：
 * - 不负责：文章任务编排
 *
 * 入口：
 * - GscService
 */

import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  GSC_OAUTH_SCOPES,
  GSC_STALE_SYNC_DAYS,
  GSC_SYNC_DAYS,
  GSC_TOP_ROW_LIMIT,
  type GscSummaryData,
  parseGscSummaryData,
} from './gsc.constants';
import {
  pickUnderperformingJobs,
  type GscUnderperformingJob,
} from './gsc-underperform.util';
import {
  formatGscDate,
  matchGscPropertyUrl,
  pageUrlsMatchForGsc,
  signGscOAuthState,
  verifyGscOAuthState,
} from './gsc-oauth.util';

interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webAppOrigin: string;
}

export interface GscJobPagePerformance {
  impressions: number;
  clicks: number;
  position: number;
  periodDays: number;
  syncedAt: string;
}

@Injectable()
export class GscService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  isConfigured(): boolean {
    return this.readOAuthConfig() !== null;
  }

  async getStatus(organizationId: string, projectId: string, siteId: string) {
    await this.assertSite(organizationId, projectId, siteId);
    const connection = await this.prisma.siteGscConnection.findUnique({
      where: { siteId },
    });

    return {
      configured: this.isConfigured(),
      connected: Boolean(connection?.refreshToken),
      propertyUrl: connection?.propertyUrl ?? null,
      lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: connection?.lastSyncError ?? null,
      summary: connection?.summaryData ?? null,
    };
  }

  async createConnectUrl(organizationId: string, projectId: string, siteId: string) {
    const cfg = this.requireOAuthConfig();
    await this.assertSite(organizationId, projectId, siteId);

    const state = signGscOAuthState({
      siteId,
      organizationId,
      projectId,
      exp: Date.now() + 10 * 60 * 1000,
    });

    const client = this.createOAuthClient(cfg);
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GSC_OAUTH_SCOPES,
      state,
    });

    return { authUrl };
  }

  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const cfg = this.requireOAuthConfig();
    const payload = verifyGscOAuthState(state);

    if (!payload) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'GSC 授权状态无效或已过期');
    }

    const site = await this.assertSite(payload.organizationId, payload.projectId, payload.siteId);
    const client = this.createOAuthClient(cfg);
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'Google 未返回 refresh_token，请撤销授权后重试',
      );
    }

    client.setCredentials(tokens);
    const searchconsole = google.searchconsole({ version: 'v1', auth: client });
    const sitesRes = await searchconsole.sites.list();
    const entries = (sitesRes.data.siteEntry ?? [])
      .map((item) => item.siteUrl)
      .filter((item): item is string => Boolean(item));

    const propertyUrl = matchGscPropertyUrl(site.domain, entries);
    if (!propertyUrl) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '未在 Google Search Console 中找到与该站点域名匹配的资源',
      );
    }

    await this.prisma.siteGscConnection.upsert({
      where: { siteId: site.id },
      create: {
        organizationId: payload.organizationId,
        siteId: site.id,
        propertyUrl,
        refreshToken: tokens.refresh_token,
        lastSyncError: null,
      },
      update: {
        propertyUrl,
        refreshToken: tokens.refresh_token,
        lastSyncError: null,
      },
    });

    this.logger.info('GSC connected', {
      siteId: site.id,
      propertyUrl,
      action: 'gsc.connect',
    });

    try {
      await this.sync(payload.organizationId, payload.projectId, site.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GSC 首次同步失败';
      this.logger.warn('GSC initial sync failed after connect', {
        siteId: site.id,
        action: 'gsc.connect.sync',
        message,
      });
    }

    return `${cfg.webAppOrigin}/projects/${payload.projectId}/seo-factory/gsc?gsc=connected`;
  }

  async disconnect(organizationId: string, projectId: string, siteId: string) {
    await this.assertSite(organizationId, projectId, siteId);
    await this.prisma.siteGscConnection.deleteMany({
      where: { siteId, organizationId },
    });
    return { disconnected: true };
  }

  async sync(organizationId: string, projectId: string, siteId: string) {
    const site = await this.assertSite(organizationId, projectId, siteId);
    const connection = await this.prisma.siteGscConnection.findUnique({ where: { siteId } });

    if (!connection?.refreshToken || !connection.propertyUrl) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONNECTED, '请先连接 Google Search Console');
    }

    const cfg = this.requireOAuthConfig();
    const client = this.createOAuthClient(cfg);
    client.setCredentials({ refresh_token: connection.refreshToken });

    const searchconsole = google.searchconsole({ version: 'v1', auth: client });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - GSC_SYNC_DAYS);

    try {
      const [pageRes, queryRes, totalRes] = await Promise.all([
        searchconsole.searchanalytics.query({
          siteUrl: connection.propertyUrl,
          requestBody: {
            startDate: formatGscDate(startDate),
            endDate: formatGscDate(endDate),
            dimensions: ['page'],
            rowLimit: GSC_TOP_ROW_LIMIT,
          },
        }),
        searchconsole.searchanalytics.query({
          siteUrl: connection.propertyUrl,
          requestBody: {
            startDate: formatGscDate(startDate),
            endDate: formatGscDate(endDate),
            dimensions: ['query'],
            rowLimit: GSC_TOP_ROW_LIMIT,
          },
        }),
        searchconsole.searchanalytics.query({
          siteUrl: connection.propertyUrl,
          requestBody: {
            startDate: formatGscDate(startDate),
            endDate: formatGscDate(endDate),
          },
        }),
      ]);

      const summary = this.buildSummary(pageRes.data, queryRes.data, totalRes.data);

      await this.prisma.siteGscConnection.update({
        where: { siteId },
        data: {
          lastSyncAt: new Date(),
          lastSyncError: null,
          summaryData: summary as object,
        },
      });

      this.logger.info('GSC synced', {
        siteId: site.id,
        propertyUrl: connection.propertyUrl,
        action: 'gsc.sync',
      });

      return { summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GSC 同步失败';
      await this.prisma.siteGscConnection.update({
        where: { siteId },
        data: { lastSyncError: message },
      });
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, message);
    }
  }

  /** 定时任务：同步所有过期或未同步的 GSC 连接 */
  async syncAllStaleConnections(): Promise<{ synced: number; failed: number; skipped: number }> {
    if (!this.isConfigured()) {
      return { synced: 0, failed: 0, skipped: 0 };
    }

    const staleMs = GSC_STALE_SYNC_DAYS * 24 * 60 * 60 * 1000;
    const connections = await this.prisma.siteGscConnection.findMany({
      where: { refreshToken: { not: null } },
      select: {
        siteId: true,
        organizationId: true,
        lastSyncAt: true,
        site: { select: { projectId: true } },
      },
    });

    const stale = connections.filter(
      (row) => !row.lastSyncAt || Date.now() - row.lastSyncAt.getTime() > staleMs,
    );

    let synced = 0;
    let failed = 0;

    for (const row of stale) {
      try {
        await this.sync(row.organizationId, row.site.projectId, row.siteId);
        synced += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'GSC 同步失败';
        this.logger.warn('GSC scheduled sync failed', {
          siteId: row.siteId,
          action: 'gsc.sync.scheduled',
          message,
        });
      }
    }

    if (synced > 0 || failed > 0) {
      this.logger.info('GSC scheduled sync finished', {
        action: 'gsc.sync.scheduled',
        synced,
        failed,
        total: stale.length,
      });
    }

    return { synced, failed, skipped: connections.length - stale.length };
  }

  async getProjectOverview(organizationId: string, projectId: string) {
    const sites = await this.prisma.site.findMany({
      where: { organizationId, projectId },
      select: {
        id: true,
        domain: true,
        gscConnection: {
          select: {
            propertyUrl: true,
            refreshToken: true,
            lastSyncAt: true,
            lastSyncError: true,
            summaryData: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const publishedJobs = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        siteId: true,
        targetKeyword: true,
        seoCheckData: true,
      },
    });

    const jobsBySite = new Map<string, Array<{ id: string; keyword: string; postUrl: string }>>();
    for (const job of publishedJobs) {
      const postUrl = (
        (job.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish
          ?.postUrl ?? ''
      ).trim();
      if (!postUrl) continue;

      const bucket = jobsBySite.get(job.siteId) ?? [];
      bucket.push({ id: job.id, keyword: job.targetKeyword, postUrl });
      jobsBySite.set(job.siteId, bucket);
    }

    return sites.map((site) => {
      const summary = this.enrichSummaryWithJobMatches(
        parseGscSummaryData(site.gscConnection?.summaryData),
        jobsBySite.get(site.id) ?? [],
      );

      return {
        siteId: site.id,
        domain: site.domain,
        connected: Boolean(site.gscConnection?.refreshToken),
        propertyUrl: site.gscConnection?.propertyUrl ?? null,
        lastSyncAt: site.gscConnection?.lastSyncAt?.toISOString() ?? null,
        lastSyncError: site.gscConnection?.lastSyncError ?? null,
        summary,
      };
    });
  }

  async getUnderperformingJobs(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<GscUnderperformingJob[]> {
    const sites = await this.prisma.site.findMany({
      where: {
        organizationId,
        projectId,
        ...(siteId ? { id: siteId } : {}),
      },
      select: {
        id: true,
        gscConnection: {
          select: {
            refreshToken: true,
            lastSyncAt: true,
            summaryData: true,
          },
        },
      },
    });

    const publishedJobs = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
        ...(siteId ? { siteId } : {}),
      },
      select: {
        id: true,
        siteId: true,
        targetKeyword: true,
        seoCheckData: true,
      },
    });

    const jobsBySite = new Map<string, Array<{ id: string; keyword: string; postUrl: string }>>();
    for (const job of publishedJobs) {
      const postUrl = (
        (job.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish
          ?.postUrl ?? ''
      ).trim();
      if (!postUrl) continue;

      const bucket = jobsBySite.get(job.siteId) ?? [];
      bucket.push({ id: job.id, keyword: job.targetKeyword, postUrl });
      jobsBySite.set(job.siteId, bucket);
    }

    const collected: GscUnderperformingJob[] = [];

    for (const site of sites) {
      if (!site.gscConnection?.refreshToken || !site.gscConnection.lastSyncAt) continue;

      const summary = this.enrichSummaryWithJobMatches(
        parseGscSummaryData(site.gscConnection.summaryData),
        jobsBySite.get(site.id) ?? [],
      );
      if (!summary) continue;

      collected.push(...pickUnderperformingJobs(summary.topPages));
    }

    return collected
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3);
  }

  /** 单篇已发布任务在 GSC 中的页面表现（无数据返回 null） */
  async getJobPagePerformance(
    organizationId: string,
    projectId: string,
    jobId: string,
  ): Promise<GscJobPagePerformance | null> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { siteId: true, seoCheckData: true },
    });
    if (!job) {
      return null;
    }

    const postUrl = (
      (job.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish
        ?.postUrl ?? ''
    ).trim();
    if (!postUrl) {
      return null;
    }

    const connection = await this.prisma.siteGscConnection.findFirst({
      where: { siteId: job.siteId },
      select: {
        refreshToken: true,
        lastSyncAt: true,
        summaryData: true,
      },
    });
    if (!connection?.refreshToken || !connection.lastSyncAt) {
      return null;
    }

    const summary = parseGscSummaryData(connection.summaryData);
    if (!summary) {
      return null;
    }

    const matched = summary.topPages.find((row) =>
      pageUrlsMatchForGsc(row.page, postUrl),
    );
    if (!matched) {
      return null;
    }

    return {
      impressions: matched.impressions,
      clicks: matched.clicks,
      position: matched.position,
      periodDays: summary.periodDays,
      syncedAt: connection.lastSyncAt.toISOString(),
    };
  }

  private enrichSummaryWithJobMatches(
    summary: GscSummaryData | null,
    jobs: Array<{ id: string; keyword: string; postUrl: string }>,
  ): GscSummaryData | null {
    if (!summary) return null;

    return {
      ...summary,
      topPages: summary.topPages.map((row) => {
        const matched = jobs.find((job) => pageUrlsMatchForGsc(row.page, job.postUrl));
        if (!matched) return row;
        return {
          ...row,
          matchedJobId: matched.id,
          matchedKeyword: matched.keyword,
        };
      }),
    };
  }

  private buildSummary(
    pageData: { rows?: Array<{ keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }> | null },
    queryData: { rows?: Array<{ keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }> | null },
    totalData: { rows?: Array<{ clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }> | null },
  ): GscSummaryData {
    const totalRow = totalData.rows?.[0];
    const mapPageRow = (
      row: { keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null },
    ) => ({
      page: row.keys?.[0] ?? '',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    });
    const mapQueryRow = (
      row: { keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null },
    ) => ({
      query: row.keys?.[0] ?? '',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    });

    return {
      periodDays: GSC_SYNC_DAYS,
      syncedAt: new Date().toISOString(),
      totals: {
        clicks: totalRow?.clicks ?? 0,
        impressions: totalRow?.impressions ?? 0,
        ctr: totalRow?.ctr ?? 0,
        position: totalRow?.position ?? 0,
      },
      topPages: (pageData.rows ?? []).map(mapPageRow),
      topQueries: (queryData.rows ?? []).map(mapQueryRow),
    };
  }

  private readOAuthConfig(): GscOAuthConfig | null {
    const clientId = process.env.GOOGLE_GSC_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_GSC_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_GSC_REDIRECT_URI?.trim();
    const webAppOrigin = process.env.WEB_APP_ORIGIN?.trim() || 'http://localhost:5173';

    if (!clientId || !clientSecret || !redirectUri) {
      return null;
    }

    return { clientId, clientSecret, redirectUri, webAppOrigin };
  }

  private requireOAuthConfig(): GscOAuthConfig {
    const cfg = this.readOAuthConfig();
    if (!cfg) {
      throw new BusinessException(
        ErrorCodes.GSC_NOT_CONFIGURED,
        '未配置 Google Search Console OAuth（GOOGLE_GSC_CLIENT_ID / SECRET / REDIRECT_URI）',
      );
    }
    return cfg;
  }

  private createOAuthClient(cfg: GscOAuthConfig) {
    return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  }

  private async assertSite(organizationId: string, projectId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { id: true, domain: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    return site;
  }
}
