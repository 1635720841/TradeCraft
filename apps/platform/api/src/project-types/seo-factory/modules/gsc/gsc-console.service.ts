/**
 * Console GSC 站点连接与批量自动绑定。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import { resolvePlanEntitlements } from '../../../../modules/billing/plan-entitlements.constants';
import { buildConsoleGscSiteWhere } from '../../../../modules/console/console-site-query.util';
import {
  formatGscUserError,
  matchGscPropertyUrl,
  propertyMatchesSiteDomain,
} from './gsc-oauth.util';
import { GscOAuthService } from './gsc-oauth.service';
import { GscSyncService } from './gsc-sync.service';
import {
  GSC_AUTO_CONNECT_BATCH_SIZE,
  isSiteGscConnected,
  type ConsoleGscSiteRow,
} from './gsc.types';

@Injectable()
export class GscConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly entitlementsService: EntitlementsService,
    private readonly oauth: GscOAuthService,
    private readonly syncService: GscSyncService,
  ) {}

  async listConsoleSites(options?: {
    page?: number;
    limit?: number;
    keyword?: string;
    connected?: 'true' | 'false';
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const keyword = options?.keyword?.trim();
    const where = buildConsoleGscSiteWhere({ keyword, connected: options?.connected });

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
      connected: isSiteGscConnected(site.gscConnection),
      managedByPlatform: site.gscConnection?.managedByPlatform ?? false,
      propertyUrl: site.gscConnection?.propertyUrl ?? null,
      lastSyncAt: site.gscConnection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: site.gscConnection?.lastSyncError ?? null,
      gscEnabled: resolvePlanEntitlements(site.project.organization.planName).gscEnabled,
    }));

    return { items, page, limit, total };
  }

  async autoConnectAllUnconnected() {
    const platformToken = await this.oauth.getPlatformRefreshToken();
    if (!platformToken) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONFIGURED, '请先完成平台 Google 授权');
    }

    const unconnectedWhere = {
      OR: [
        { gscConnection: null },
        { gscConnection: { OR: [{ propertyUrl: null }, { managedByPlatform: false }] } },
      ],
    };

    let connected = 0;
    let failed = 0;
    let skipped = 0;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const sites = await this.prisma.site.findMany({
        where: unconnectedWhere,
        select: {
          id: true,
          domain: true,
          organizationId: true,
          projectId: true,
        },
        orderBy: { id: 'asc' },
        take: GSC_AUTO_CONNECT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (sites.length === 0) break;
      total += sites.length;

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

      cursor = sites[sites.length - 1]?.id;
      if (sites.length < GSC_AUTO_CONNECT_BATCH_SIZE) break;
    }

    return { connected, failed, skipped, total };
  }

  async tryAutoConnectSite(params: {
    organizationId: string;
    projectId: string;
    siteId: string;
    domain: string;
  }): Promise<{ connected: boolean; reason?: string }> {
    if (!this.oauth.isConfigured()) {
      return { connected: false, reason: 'oauth_not_configured' };
    }

    const platformToken = await this.oauth.getPlatformRefreshToken();
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
      const entries = await this.oauth.listGscPropertyEntries(platformToken);
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

      void this.syncService
        .sync(params.organizationId, params.projectId, params.siteId)
        .catch((error) => {
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
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, deletedAt: null },
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
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, deletedAt: null },
      select: { id: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    await this.prisma.siteGscConnection.deleteMany({ where: { siteId } });
    return { disconnected: true };
  }

  async syncConsoleSite(siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    await this.entitlementsService.assertEntitlement(site.organizationId, 'gscEnabled');
    return this.syncService.sync(site.organizationId, site.projectId, site.id);
  }
}
