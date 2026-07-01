/**
 * GSC 搜索表现分析与词库洞察。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import {
  parseGscSummaryData,
  type GscSummaryData,
} from './gsc.constants';
import {
  buildGscKeywordInsight,
  matchGscQueryToKeyword,
  pickDiscoveredGscQueries,
  type GscKeywordInsight,
} from './gsc-keyword-match.util';
import {
  pickUnderperformingJobs,
  type GscUnderperformingJob,
} from './gsc-underperform.util';
import { pageUrlsMatchForGsc } from './gsc-oauth.util';
import {
  isSiteGscConnected,
  type GscDiscoveredQuery,
  type GscJobPagePerformance,
  type GscProjectQueryRow,
} from './gsc.types';

@Injectable()
export class GscAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

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

    const jobsBySite = this.groupPublishedJobs(publishedJobs);

    return sites.map((site) => {
      const summary = this.enrichSummaryWithJobMatches(
        parseGscSummaryData(site.gscConnection?.summaryData),
        jobsBySite.get(site.id) ?? [],
      );

      return {
        siteId: site.id,
        domain: site.domain,
        connected: isSiteGscConnected(site.gscConnection),
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

    const jobsBySite = this.groupPublishedJobs(publishedJobs);
    const collected: GscUnderperformingJob[] = [];

    for (const site of sites) {
      if (!isSiteGscConnected(site.gscConnection) || !site.gscConnection?.lastSyncAt) continue;

      const summary = this.enrichSummaryWithJobMatches(
        parseGscSummaryData(site.gscConnection.summaryData),
        jobsBySite.get(site.id) ?? [],
      );
      if (!summary) continue;

      collected.push(...pickUnderperformingJobs(summary.topPages));
    }

    return collected.sort((a, b) => b.impressions - a.impressions).slice(0, 3);
  }

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
      if (!isSiteGscConnected(site.gscConnection) || !site.gscConnection?.lastSyncAt) {
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
      siteDomain:
        queries.find((q) => q.query === row.query && q.siteId === row.siteId)?.siteDomain ?? '',
    }));
  }

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
    if (!isSiteGscConnected(connection) || !connection?.lastSyncAt) {
      return null;
    }

    const summary = parseGscSummaryData(connection.summaryData);
    if (!summary) {
      return null;
    }

    const matched = summary.topPages.find((row) => pageUrlsMatchForGsc(row.page, postUrl));
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

  private groupPublishedJobs(
    publishedJobs: Array<{
      id: string;
      siteId: string;
      targetKeyword: string;
      seoCheckData: unknown;
    }>,
  ) {
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
    return jobsBySite;
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
}
