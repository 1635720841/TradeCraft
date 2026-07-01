/**
 * Google Search Console 门面：委托 OAuth / 同步 / Console / 分析子服务。
 *
 * 边界：
 * - 不负责：文章任务编排
 *
 * 入口：
 * - GscService
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { assertSiteScope } from '../../utils/assert-site-scope.util';
import type { GscKeywordInsight } from './gsc-keyword-match.util';
import type { GscUnderperformingJob } from './gsc-underperform.util';
import { GscAnalyticsService } from './gsc-analytics.service';
import { GscConsoleService } from './gsc-console.service';
import { GscOAuthService } from './gsc-oauth.service';
import { GscSyncService } from './gsc-sync.service';
import {
  isSiteGscConnected,
  type GscDiscoveredQuery,
  type GscJobPagePerformance,
  type GscProjectQueryRow,
  type PlatformGscStatus,
} from './gsc.types';

export type {
  ConsoleGscSiteRow,
  GscDiscoveredQuery,
  GscJobPagePerformance,
  GscProjectQueryRow,
  PlatformGscStatus,
} from './gsc.types';

@Injectable()
export class GscService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly oauth: GscOAuthService,
    private readonly syncService: GscSyncService,
    private readonly consoleService: GscConsoleService,
    private readonly analytics: GscAnalyticsService,
  ) {}

  isConfigured(): boolean {
    return this.oauth.isConfigured();
  }

  getPlatformStatus(): Promise<PlatformGscStatus> {
    return this.oauth.getPlatformStatus();
  }

  createPlatformConnectUrl(connectedByUserId?: string) {
    return this.oauth.createPlatformConnectUrl(connectedByUserId);
  }

  disconnectPlatform() {
    return this.oauth.disconnectPlatform();
  }

  listConsoleSites(options?: {
    page?: number;
    limit?: number;
    keyword?: string;
    connected?: 'true' | 'false';
  }) {
    return this.consoleService.listConsoleSites(options);
  }

  autoConnectAllUnconnected() {
    return this.consoleService.autoConnectAllUnconnected();
  }

  tryAutoConnectSite(params: {
    organizationId: string;
    projectId: string;
    siteId: string;
    domain: string;
  }) {
    return this.consoleService.tryAutoConnectSite(params);
  }

  connectConsoleSite(siteId: string) {
    return this.consoleService.connectConsoleSite(siteId);
  }

  disconnectConsoleSite(siteId: string) {
    return this.consoleService.disconnectConsoleSite(siteId);
  }

  syncConsoleSite(siteId: string) {
    return this.consoleService.syncConsoleSite(siteId);
  }

  async getStatus(organizationId: string, projectId: string, siteId: string) {
    await assertSiteScope(this.prisma, organizationId, projectId, siteId);
    const connection = await this.prisma.siteGscConnection.findUnique({
      where: { siteId },
    });

    const platformConnected = Boolean(await this.oauth.getPlatformRefreshToken());

    return {
      configured: this.oauth.isConfigured() && platformConnected,
      connected: isSiteGscConnected(connection),
      propertyUrl: connection?.propertyUrl ?? null,
      lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: connection?.lastSyncError ?? null,
      summary: connection?.summaryData ?? null,
    };
  }

  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const url = await this.oauth.handleOAuthCallback(code, state);

    void this.consoleService.autoConnectAllUnconnected().catch((error) => {
      const message = error instanceof Error ? error.message : 'GSC 批量自动绑定失败';
      this.logger.warn('GSC bulk auto-connect after platform OAuth failed', {
        action: 'gsc.platform.auto_connect_all',
        message,
      });
    });

    return url;
  }

  disconnect(_organizationId: string, _projectId: string, _siteId: string) {
    throw new BusinessException(
      ErrorCodes.FORBIDDEN,
      '搜索表现由平台管理员统一配置，请联系平台运营',
    );
  }

  sync(organizationId: string, projectId: string, siteId: string) {
    return this.syncService.sync(organizationId, projectId, siteId);
  }

  syncAllStaleConnections() {
    return this.syncService.syncAllStaleConnections();
  }

  getProjectOverview(organizationId: string, projectId: string) {
    return this.analytics.getProjectOverview(organizationId, projectId);
  }

  getUnderperformingJobs(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<GscUnderperformingJob[]> {
    return this.analytics.getUnderperformingJobs(organizationId, projectId, siteId);
  }

  collectProjectGscQueries(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<GscProjectQueryRow[]> {
    return this.analytics.collectProjectGscQueries(organizationId, projectId, siteId);
  }

  getDiscoveredQueries(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<GscDiscoveredQuery[]> {
    return this.analytics.getDiscoveredQueries(organizationId, projectId, siteId);
  }

  buildKeywordGscInsights(
    keywords: Array<{ id: string; keyword: string; siteId: string | null; status: string }>,
    queries: GscProjectQueryRow[],
  ): Map<string, GscKeywordInsight> {
    return this.analytics.buildKeywordGscInsights(keywords, queries);
  }

  getJobPagePerformance(
    organizationId: string,
    projectId: string,
    jobId: string,
  ): Promise<GscJobPagePerformance | null> {
    return this.analytics.getJobPagePerformance(organizationId, projectId, jobId);
  }
}
