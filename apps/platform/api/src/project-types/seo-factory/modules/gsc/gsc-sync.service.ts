/**
 * GSC 数据同步（单站与批量定时）。
 */

import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import { assertSiteScope } from '../../utils/assert-site-scope.util';
import {
  GSC_STALE_SYNC_DAYS,
  GSC_SYNC_DAYS,
  GSC_TOP_ROW_LIMIT,
  type GscSummaryData,
} from './gsc.constants';
import { formatGscDate, formatGscUserError } from './gsc-oauth.util';
import { GscOAuthService } from './gsc-oauth.service';
import { isSiteGscConnected } from './gsc.types';

@Injectable()
export class GscSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly entitlementsService: EntitlementsService,
    private readonly oauth: GscOAuthService,
  ) {}

  async sync(organizationId: string, projectId: string, siteId: string) {
    const site = await assertSiteScope(this.prisma, organizationId, projectId, siteId, {
      selectDomain: true,
    });
    const connection = await this.prisma.siteGscConnection.findUnique({ where: { siteId } });

    if (!isSiteGscConnected(connection) || !connection?.propertyUrl) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONNECTED, '站点尚未绑定 Google Search Console');
    }

    const platformToken = await this.oauth.getPlatformRefreshToken();
    if (!platformToken) {
      throw new BusinessException(ErrorCodes.GSC_NOT_CONFIGURED, '请先完成平台 Google 授权');
    }

    const cfg = this.oauth.requireOAuthConfig();
    const client = this.oauth.createOAuthClient(cfg);
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

  async syncAllStaleConnections(): Promise<{ synced: number; failed: number; skipped: number }> {
    if (!this.oauth.isConfigured()) {
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

  private buildSummary(
    pageData: {
      rows?: Array<{
        keys?: string[] | null;
        clicks?: number | null;
        impressions?: number | null;
        ctr?: number | null;
        position?: number | null;
      }> | null;
    },
    queryData: {
      rows?: Array<{
        keys?: string[] | null;
        clicks?: number | null;
        impressions?: number | null;
        ctr?: number | null;
        position?: number | null;
      }> | null;
    },
    totalData: {
      rows?: Array<{
        clicks?: number | null;
        impressions?: number | null;
        ctr?: number | null;
        position?: number | null;
      }> | null;
    },
  ): GscSummaryData {
    const totalRow = totalData.rows?.[0];
    const mapPageRow = (row: {
      keys?: string[] | null;
      clicks?: number | null;
      impressions?: number | null;
      ctr?: number | null;
      position?: number | null;
    }) => ({
      page: row.keys?.[0] ?? '',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    });
    const mapQueryRow = (row: {
      keys?: string[] | null;
      clicks?: number | null;
      impressions?: number | null;
      ctr?: number | null;
      position?: number | null;
    }) => ({
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
}
