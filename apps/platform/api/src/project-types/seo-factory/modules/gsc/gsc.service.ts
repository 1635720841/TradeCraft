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
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../../../../core/crypto/secret-cipher.util';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import { resolvePlanEntitlements } from '../../../../modules/billing/plan-entitlements.constants';
import {
  GSC_OAUTH_SCOPES,
  GSC_STALE_SYNC_DAYS,
  GSC_SYNC_DAYS,
  GSC_TOP_ROW_LIMIT,
  type GscSummaryData,
  parseGscSummaryData,
} from './gsc.constants';
import {
  buildGscKeywordInsight,
  matchGscQueryToKeyword,
  pickDiscoveredGscQueries,
  type GscKeywordInsight,
  type GscQueryMetricRow,
} from './gsc-keyword-match.util';
import {
  pickUnderperformingJobs,
  type GscUnderperformingJob,
} from './gsc-underperform.util';
import {
  filterUsableGscPropertyEntries,
  formatGscDate,
  formatGscUserError,
  matchGscPropertyUrl,
  pageUrlsMatchForGsc,
  propertyMatchesSiteDomain,
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

export interface PlatformGscStatus {
  oauthConfigured: boolean;
  platformConnected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
  propertyCount: number | null;
}

export interface ConsoleGscSiteRow {
  siteId: string;
  domain: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  connected: boolean;
  managedByPlatform: boolean;
  propertyUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  gscEnabled: boolean;
}

export interface GscProjectQueryRow extends GscQueryMetricRow {
  siteDomain: string;
  periodDays: number;
  syncedAt: string;
}

export interface GscDiscoveredQuery {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  siteId: string;
  siteDomain: string;
}

const PLATFORM_CREDENTIAL_ID = 'default';
const PROPERTY_COUNT_CACHE_MS = 5 * 60 * 1000;

@Injectable()
export class GscService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  isConfigured(): boolean {
    return this.readOAuthConfig() !== null;
  }

  async getPlatformStatus(): Promise<PlatformGscStatus> {
    const oauthConfigured = this.isConfigured();
    const credential = await this.prisma.platformGscCredential.findUnique({
      where: { id: PLATFORM_CREDENTIAL_ID },
    });

    if (!credential) {
      return {
        oauthConfigured,
        platformConnected: false,
        googleEmail: null,
        connectedAt: null,
        propertyCount: null,
      };
    }

    let propertyCount: number | null = credential.cachedPropertyCount ?? null;
    if (oauthConfigured) {
      const cacheValid =
        credential.propertyCountCachedAt &&
        Date.now() - credential.propertyCountCachedAt.getTime() < PROPERTY_COUNT_CACHE_MS;
      if (cacheValid && propertyCount !== null) {
        // use cached
      } else {
        try {
          const token = await this.getPlatformRefreshToken();
          if (token) {
            const entries = await this.listGscPropertyEntries(token);
            propertyCount = entries.length;
            await this.prisma.platformGscCredential.update({
              where: { id: PLATFORM_CREDENTIAL_ID },
              data: {
                cachedPropertyCount: propertyCount,
                propertyCountCachedAt: new Date(),
              },
            });
          }
        } catch {
          propertyCount = credential.cachedPropertyCount ?? null;
        }
      }
    }

    return {
      oauthConfigured,
      platformConnected: true,
      googleEmail: credential.googleEmail ?? null,
      connectedAt: credential.createdAt.toISOString(),
      propertyCount,
    };
  }

  async createPlatformConnectUrl(connectedByUserId?: string) {
    const cfg = this.requireOAuthConfig();
    const state = signGscOAuthState({
      mode: 'platform',
      exp: Date.now() + 10 * 60 * 1000,
      connectedByUserId,
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

  async disconnectPlatform() {
    await this.prisma.$transaction([
      this.prisma.siteGscConnection.deleteMany({
        where: { managedByPlatform: true },
      }),
      this.prisma.platformGscCredential.deleteMany({
        where: { id: PLATFORM_CREDENTIAL_ID },
      }),
    ]);
    return { disconnected: true };
  }

  async listConsoleSites(options?: {
    page?: number;
    limit?: number;
    keyword?: string;
    connected?: 'true' | 'false';
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const keyword = options?.keyword?.trim();

    const where: Prisma.SiteWhereInput = {};
    const andFilters: Prisma.SiteWhereInput[] = [];

    if (keyword) {
      andFilters.push({
        OR: [
          { domain: { contains: keyword, mode: 'insensitive' } },
          { project: { name: { contains: keyword, mode: 'insensitive' } } },
          { project: { organization: { name: { contains: keyword, mode: 'insensitive' } } } },
        ],
      });
    }

    if (options?.connected === 'true') {
      andFilters.push({
        gscConnection: {
          propertyUrl: { not: null },
          managedByPlatform: true,
        },
      });
    } else if (options?.connected === 'false') {
      andFilters.push({
        OR: [
          { gscConnection: null },
          { gscConnection: { OR: [{ propertyUrl: null }, { managedByPlatform: false }] } },
        ],
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const [total, sites] = await Promise.all([
      this.prisma.site.count({ where }),
      this.prisma.site.findMany({
        where,
        select: {
          id: true,
          domain: true,
          organizationId: true,
          projectId: true,
          project: {
            select: {
              name: true,
              organization: { select: { name: true, planName: true } },
            },
          },
          gscConnection: {
            select: {
              propertyUrl: true,
              managedByPlatform: true,
              lastSyncAt: true,
              lastSyncError: true,
            },
          },
        },
        orderBy: [{ project: { organization: { name: 'asc' } } }, { domain: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items: ConsoleGscSiteRow[] = sites.map((site) => ({
      siteId: site.id,
      domain: site.domain,
      organizationId: site.organizationId,
      organizationName: site.project.organization.name,
      projectId: site.projectId,
      projectName: site.project.name,
      connected: this.isSiteGscConnected(site.gscConnection),
      managedByPlatform: site.gscConnection?.managedByPlatform ?? false,
      propertyUrl: site.gscConnection?.propertyUrl ?? null,
      lastSyncAt: site.gscConnection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: site.gscConnection?.lastSyncError ?? null,
      gscEnabled: resolvePlanEntitlements(site.project.organization.planName).gscEnabled,
    }));

    return { items, page, limit, total };
  }

  async autoConnectAllUnconnected() {
    const platformToken = await this.getPlatformRefreshToken();
    if (!platformToken) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONFIGURED, '请先完成平台 Google 授权');
    }

    const sites = await this.prisma.site.findMany({
      where: {
        OR: [
          { gscConnection: null },
          { gscConnection: { OR: [{ propertyUrl: null }, { managedByPlatform: false }] } },
        ],
      },
      select: {
        id: true,
        domain: true,
        organizationId: true,
        projectId: true,
      },
    });

    let connected = 0;
    let failed = 0;
    let skipped = 0;

    for (const site of sites) {
      const result = await this.tryAutoConnectSite({
        organizationId: site.organizationId,
        projectId: site.projectId,
        siteId: site.id,
        domain: site.domain,
      });
      if (result.connected) {
        connected += 1;
      } else if (result.reason === 'entitlement_disabled' || result.reason === 'already_connected') {
        skipped += 1;
      } else {
        failed += 1;
      }
    }

    return { connected, failed, skipped, total: sites.length };
  }

  async tryAutoConnectSite(params: {
    organizationId: string;
    projectId: string;
    siteId: string;
    domain: string;
  }): Promise<{ connected: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      return { connected: false, reason: 'oauth_not_configured' };
    }

    const platformToken = await this.getPlatformRefreshToken();
    if (!platformToken) {
      return { connected: false, reason: 'platform_not_connected' };
    }

    const ent = await this.entitlementsService.getForOrganization(params.organizationId);
    if (!ent.gscEnabled) {
      return { connected: false, reason: 'entitlement_disabled' };
    }

    const existing = await this.prisma.siteGscConnection.findUnique({
      where: { siteId: params.siteId },
    });
    if (
      existing?.propertyUrl &&
      existing.managedByPlatform &&
      propertyMatchesSiteDomain(existing.propertyUrl, params.domain)
    ) {
      return { connected: true, reason: 'already_connected' };
    }

    try {
      const entries = await this.listGscPropertyEntries(platformToken);
      const propertyUrl = matchGscPropertyUrl(params.domain, entries);

      if (!propertyUrl) {
        await this.prisma.siteGscConnection.upsert({
          where: { siteId: params.siteId },
          create: {
            organizationId: params.organizationId,
            siteId: params.siteId,
            propertyUrl: null,
            managedByPlatform: true,
            lastSyncError: '未在 Google Search Console 中找到与该域名匹配的资源',
          },
          update: {
            managedByPlatform: true,
            lastSyncError: '未在 Google Search Console 中找到与该域名匹配的资源',
          },
        });
        return { connected: false, reason: 'property_not_found' };
      }

      await this.prisma.siteGscConnection.upsert({
        where: { siteId: params.siteId },
        create: {
          organizationId: params.organizationId,
          siteId: params.siteId,
          propertyUrl,
          managedByPlatform: true,
          lastSyncError: null,
        },
        update: {
          propertyUrl,
          managedByPlatform: true,
          lastSyncError: null,
        },
      });

      this.logger.info('GSC auto-connected', {
        siteId: params.siteId,
        propertyUrl,
        action: 'gsc.auto_connect',
      });

      void this.sync(params.organizationId, params.projectId, params.siteId).catch((error) => {
        const message = error instanceof Error ? error.message : 'GSC 首次同步失败';
        this.logger.warn('GSC initial sync failed after auto-connect', {
          siteId: params.siteId,
          action: 'gsc.auto_connect.sync',
          message,
        });
      });

      return { connected: true };
    } catch (error) {
      const message = formatGscUserError(
        error instanceof Error ? error.message : 'GSC 自动连接失败',
      );
      await this.prisma.siteGscConnection.upsert({
        where: { siteId: params.siteId },
        create: {
          organizationId: params.organizationId,
          siteId: params.siteId,
          propertyUrl: null,
          managedByPlatform: true,
          lastSyncError: message,
        },
        update: {
          managedByPlatform: true,
          lastSyncError: message,
        },
      });
      return { connected: false, reason: 'error' };
    }
  }

  async connectConsoleSite(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true, organizationId: true, projectId: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    return this.tryAutoConnectSite({
      organizationId: site.organizationId,
      projectId: site.projectId,
      siteId: site.id,
      domain: site.domain,
    });
  }

  async disconnectConsoleSite(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    await this.prisma.siteGscConnection.deleteMany({ where: { siteId } });
    return { disconnected: true };
  }

  async syncConsoleSite(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, organizationId: true, projectId: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    await this.entitlementsService.assertEntitlement(site.organizationId, 'gscEnabled');
    return this.sync(site.organizationId, site.projectId, site.id);
  }

  async getStatus(organizationId: string, projectId: string, siteId: string) {
    await this.assertSite(organizationId, projectId, siteId);
    const connection = await this.prisma.siteGscConnection.findUnique({
      where: { siteId },
    });

    const platformConnected = Boolean(await this.getPlatformRefreshToken());

    return {
      configured: this.isConfigured() && platformConnected,
      connected: this.isSiteGscConnected(connection),
      propertyUrl: connection?.propertyUrl ?? null,
      lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: connection?.lastSyncError ?? null,
      summary: connection?.summaryData ?? null,
    };
  }

  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const cfg = this.requireOAuthConfig();
    const payload = verifyGscOAuthState(state);

    if (!payload) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'GSC 授权状态无效或已过期');
    }

    if (payload.mode !== 'platform') {
      throw new BusinessException(
        ErrorCodes.FORBIDDEN,
        '站点级 OAuth 已停用，请由平台管理员在 Console 统一授权',
      );
    }

    return this.handlePlatformOAuthCallback(code, cfg, payload);
  }

  async disconnect(_organizationId: string, _projectId: string, _siteId: string) {
    throw new BusinessException(
      ErrorCodes.FORBIDDEN,
      '搜索表现由平台管理员统一配置，请联系平台运营',
    );
  }

  async sync(organizationId: string, projectId: string, siteId: string) {
    const site = await this.assertSite(organizationId, projectId, siteId);
    const connection = await this.prisma.siteGscConnection.findUnique({ where: { siteId } });

    if (!this.isSiteGscConnected(connection) || !connection?.propertyUrl) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONNECTED, '站点尚未绑定 Google Search Console');
    }

    const platformToken = await this.getPlatformRefreshToken();
    if (!platformToken) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONFIGURED, '请先完成平台 Google 授权');
    }

    const cfg = this.requireOAuthConfig();
    const client = this.createOAuthClient(cfg);
    client.setCredentials({ refresh_token: platformToken });

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
      const message = formatGscUserError(error instanceof Error ? error.message : 'GSC 同步失败');
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
      where: {
        propertyUrl: { not: null },
        managedByPlatform: true,
      },
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
    let entitlementSkipped = 0;

    for (const row of stale) {
      const ent = await this.entitlementsService.getForOrganization(row.organizationId);
      if (!ent.gscEnabled) {
        entitlementSkipped += 1;
        continue;
      }

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
        entitlementSkipped,
        total: stale.length,
      });
    }

    return {
      synced,
      failed,
      skipped: connections.length - stale.length + entitlementSkipped,
    };
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
            managedByPlatform: true,
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
        connected: this.isSiteGscConnected(site.gscConnection),
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
            propertyUrl: true,
            managedByPlatform: true,
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
      if (!this.isSiteGscConnected(site.gscConnection) || !site.gscConnection?.lastSyncAt) continue;

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

  /** 汇总项目内已同步站点的 GSC 热门搜索词 */
  async collectProjectGscQueries(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<GscProjectQueryRow[]> {
    const ent = await this.entitlementsService.getForOrganization(organizationId);
    if (!ent.gscEnabled) {
      return [];
    }

    const sites = await this.prisma.site.findMany({
      where: {
        organizationId,
        projectId,
        ...(siteId ? { id: siteId } : {}),
      },
      select: {
        id: true,
        domain: true,
        gscConnection: {
          select: {
            propertyUrl: true,
            managedByPlatform: true,
            lastSyncAt: true,
            summaryData: true,
          },
        },
      },
    });

    const rows: GscProjectQueryRow[] = [];

    for (const site of sites) {
      if (!this.isSiteGscConnected(site.gscConnection) || !site.gscConnection?.lastSyncAt) {
        continue;
      }

      const summary = parseGscSummaryData(site.gscConnection.summaryData);
      if (!summary) continue;

      const syncedAt = site.gscConnection.lastSyncAt.toISOString();
      for (const queryRow of summary.topQueries) {
        rows.push({
          query: queryRow.query,
          clicks: queryRow.clicks,
          impressions: queryRow.impressions,
          ctr: queryRow.ctr,
          position: queryRow.position,
          siteId: site.id,
          siteDomain: site.domain,
          periodDays: summary.periodDays,
          syncedAt,
        });
      }
    }

    return rows;
  }

  /** GSC 中有展示、词库中尚未收录的搜索词 */
  async getDiscoveredQueries(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<GscDiscoveredQuery[]> {
    const [queries, keywords] = await Promise.all([
      this.collectProjectGscQueries(organizationId, projectId, siteId),
      this.prisma.keywordEntry.findMany({
        where: { organizationId, projectId },
        select: { keyword: true },
      }),
    ]);

    const discovered = pickDiscoveredGscQueries(
      queries,
      keywords.map((row) => row.keyword),
    );

    return discovered.map((row) => ({
      query: row.query,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
      siteId: row.siteId ?? '',
      siteDomain: queries.find((q) => q.query === row.query && q.siteId === row.siteId)?.siteDomain ?? '',
    }));
  }

  /** 为词库条目附加 GSC 搜索验证 */
  buildKeywordGscInsights(
    keywords: Array<{ id: string; keyword: string; siteId: string | null; status: string }>,
    queries: GscProjectQueryRow[],
  ): Map<string, GscKeywordInsight> {
    const insights = new Map<string, GscKeywordInsight>();

    for (const entry of keywords) {
      const matched = matchGscQueryToKeyword(entry.keyword, queries, entry.siteId) as
        | GscProjectQueryRow
        | null;
      if (!matched) continue;

      insights.set(entry.id, buildGscKeywordInsight(matched, entry.status));
    }

    return insights;
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
        propertyUrl: true,
        managedByPlatform: true,
        lastSyncAt: true,
        summaryData: true,
      },
    });
    if (!this.isSiteGscConnected(connection) || !connection?.lastSyncAt) {
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

  private async handlePlatformOAuthCallback(
    code: string,
    cfg: GscOAuthConfig,
    payload: NonNullable<ReturnType<typeof verifyGscOAuthState>>,
  ): Promise<string> {
    const client = this.createOAuthClient(cfg);
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'Google 未返回 refresh_token，请撤销授权后重试',
      );
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    let googleEmail: string | null = null;
    try {
      const profile = await oauth2.userinfo.get();
      googleEmail = profile.data.email ?? null;
    } catch {
      googleEmail = null;
    }

    const encryptedToken = encryptSecret(tokens.refresh_token);

    await this.prisma.platformGscCredential.upsert({
      where: { id: PLATFORM_CREDENTIAL_ID },
      create: {
        id: PLATFORM_CREDENTIAL_ID,
        refreshTokenEnc: encryptedToken,
        googleEmail,
        connectedByUserId: payload.connectedByUserId ?? null,
        cachedPropertyCount: null,
        propertyCountCachedAt: null,
      },
      update: {
        refreshTokenEnc: encryptedToken,
        googleEmail,
        connectedByUserId: payload.connectedByUserId ?? null,
        cachedPropertyCount: null,
        propertyCountCachedAt: null,
      },
    });

    this.logger.info('GSC platform connected', {
      googleEmail,
      action: 'gsc.platform.connect',
    });

    void this.autoConnectAllUnconnected().catch((error) => {
      const message = error instanceof Error ? error.message : 'GSC 批量自动绑定失败';
      this.logger.warn('GSC bulk auto-connect after platform OAuth failed', {
        action: 'gsc.platform.auto_connect_all',
        message,
      });
    });

    return `${cfg.webAppOrigin}/console/gsc?gsc=connected`;
  }

  private async getPlatformRefreshToken(): Promise<string | null> {
    const credential = await this.prisma.platformGscCredential.findUnique({
      where: { id: PLATFORM_CREDENTIAL_ID },
      select: { refreshTokenEnc: true },
    });
    if (!credential?.refreshTokenEnc) {
      return null;
    }

    const plain = decryptSecret(credential.refreshTokenEnc);
    if (!isEncryptedSecret(credential.refreshTokenEnc)) {
      void this.prisma.platformGscCredential
        .update({
          where: { id: PLATFORM_CREDENTIAL_ID },
          data: { refreshTokenEnc: encryptSecret(plain) },
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'GSC token 加密迁移失败';
          this.logger.warn('GSC refresh token lazy encrypt failed', {
            action: 'gsc.token.encrypt',
            message,
          });
        });
    }

    return plain;
  }

  private async listGscPropertyEntries(refreshToken: string): Promise<string[]> {
    const cfg = this.requireOAuthConfig();
    const client = this.createOAuthClient(cfg);
    client.setCredentials({ refresh_token: refreshToken });
    const searchconsole = google.searchconsole({ version: 'v1', auth: client });
    const sitesRes = await searchconsole.sites.list();
    return filterUsableGscPropertyEntries(sitesRes.data.siteEntry ?? []);
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

  private isSiteGscConnected(
    connection:
      | {
          propertyUrl?: string | null;
          managedByPlatform?: boolean;
        }
      | null
      | undefined,
  ): boolean {
    return Boolean(connection?.propertyUrl && connection.managedByPlatform);
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
