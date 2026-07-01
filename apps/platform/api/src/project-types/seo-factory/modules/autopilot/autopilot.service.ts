/**
 * 自动生产服务：按站点配置选词入队，并在任务完成后可选推送 CMS。
 *
 * 边界：
 * - 不负责：工作流各步骤实现（WorkflowService）
 * - 不负责：Cron 注册（AutopilotScheduler）
 *
 * 入口：
 * - AutopilotService
 */

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { KeywordSource, KeywordStatus } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  ARTICLE_COMPLETED_EVENT,
  type ArticleCompletedPayload,
} from '../../../../core/event-bus/events';
import { runAfterCommit } from '../../../../core/event-bus/run-after-commit';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  isAutopilotDueNow,
  resolveSiteAutopilotSettings,
  type SiteAutopilotSettings,
} from '../../constants/site-autopilot-settings';
import { siteHasWritingProfile } from '../../constants/site-settings';
import { canPublishArticle } from '../content-review/ymyl-detect.util';
import { CmsPublishService } from '../export/cms-publish.service';
import { GscService } from '../gsc/gsc.service';
import { KeywordPoolService } from '../keyword-pool/keyword-pool.service';

interface AutopilotSiteRow {
  id: string;
  organizationId: string;
  projectId: string;
  domain: string;
  cmsType: string | null;
  settings: unknown;
}

interface AutopilotRunSiteResult {
  siteId: string;
  domain: string;
  status: 'skipped' | 'enqueued' | 'failed';
  reason?: string;
  created?: number;
  jobIds?: string[];
}

@Injectable()
export class AutopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly keywordPoolService: KeywordPoolService,
    private readonly gscService: GscService,
    private readonly cmsPublishService: CmsPublishService,
  ) {}

  async runDueSites(now = new Date()): Promise<{ checked: number; results: AutopilotRunSiteResult[] }> {
    const sites = await this.listEnabledSites();
    const dueSites = sites.filter((site) => isAutopilotDueNow(site.settings, now));
    const results: AutopilotRunSiteResult[] = [];

    for (const site of dueSites) {
      const result = await this.runSite(site).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('Autopilot site run failed', {
          action: 'autopilot.run_site_failed',
          siteId: site.id,
          organizationId: site.organizationId,
          projectId: site.projectId,
          error: message,
        });
        return {
          siteId: site.id,
          domain: site.domain,
          status: 'failed' as const,
          reason: message,
        };
      });
      results.push(result);
    }

    this.logger.info('Autopilot hourly tick finished', {
      action: 'autopilot.tick',
      enabledSites: sites.length,
      dueSites: dueSites.length,
      enqueued: results.filter((row) => row.status === 'enqueued').length,
    });

    return { checked: dueSites.length, results };
  }

  async runSite(site: AutopilotSiteRow): Promise<AutopilotRunSiteResult> {
    const autopilot = resolveSiteAutopilotSettings(site.settings);
    if (!autopilot.enabled) {
      return { siteId: site.id, domain: site.domain, status: 'skipped', reason: 'disabled' };
    }

    if (!siteHasWritingProfile(site.settings)) {
      return {
        siteId: site.id,
        domain: site.domain,
        status: 'skipped',
        reason: 'missing_writing_profile',
      };
    }

    const keywordIds = await this.pickKeywordIds(
      site.organizationId,
      site.projectId,
      site.id,
      autopilot,
    );

    if (keywordIds.length === 0) {
      return {
        siteId: site.id,
        domain: site.domain,
        status: 'skipped',
        reason: 'no_keywords',
      };
    }

    const batch = await this.keywordPoolService.createJobsFromKeywords(
      site.organizationId,
      site.projectId,
      keywordIds,
      site.id,
    );

    this.logger.info('Autopilot jobs enqueued', {
      action: 'autopilot.enqueue',
      siteId: site.id,
      organizationId: site.organizationId,
      projectId: site.projectId,
      created: batch.created,
      keywordSource: autopilot.keywordSource,
    });

    return {
      siteId: site.id,
      domain: site.domain,
      status: 'enqueued',
      created: batch.created,
      jobIds: batch.jobs.map((row) => row.job.id),
    };
  }

  @OnEvent(ARTICLE_COMPLETED_EVENT)
  onArticleCompleted(payload: ArticleCompletedPayload): void {
    runAfterCommit(() => this.handleArticleCompleted(payload));
  }

  private async handleArticleCompleted(payload: ArticleCompletedPayload): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: {
        id: payload.jobId,
        organizationId: payload.organizationId,
        projectId: payload.projectId,
      },
      select: {
        siteId: true,
        seoCheckData: true,
        site: {
          select: {
            cmsType: true,
            settings: true,
          },
        },
      },
    });

    if (!job?.site) return;

    const autopilot = resolveSiteAutopilotSettings(job.site.settings);
    if (!autopilot.enabled) return;
    if (!autopilot.publishMode || autopilot.publishMode === 'none') return;
    if (!job.site.cmsType) return;
    if (!canPublishArticle(job.seoCheckData)) return;

    const existingPublish = (
      job.seoCheckData as { cmsPublish?: { postId?: number | null } } | null
    )?.cmsPublish;
    if (existingPublish?.postId) return;

    await this.cmsPublishService.publishJob(
      payload.organizationId,
      payload.projectId,
      payload.jobId,
      payload.traceId,
      {
        status: autopilot.publishMode === 'publish' ? 'publish' : 'draft',
      },
    );

    this.logger.info('Autopilot CMS publish completed', {
      action: 'autopilot.cms_publish',
      jobId: payload.jobId,
      siteId: job.siteId,
      publishMode: autopilot.publishMode,
    });
  }

  private async listEnabledSites(): Promise<AutopilotSiteRow[]> {
    return this.prisma.site.findMany({
      where: {
        deletedAt: null,
        settings: {
          path: ['autopilot', 'enabled'],
          equals: true,
        },
      },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        domain: true,
        cmsType: true,
        settings: true,
      },
    });
  }

  private async pickKeywordIds(
    organizationId: string,
    projectId: string,
    siteId: string,
    autopilot: SiteAutopilotSettings,
  ): Promise<string[]> {
    const limit = autopilot.articlesPerRun ?? 1;
    const source = autopilot.keywordSource ?? 'priority_pool';

    if (source === 'gsc_opportunity') {
      return this.pickGscKeywordIds(organizationId, projectId, siteId, limit);
    }

    const poolIds = await this.pickPoolKeywordIds(organizationId, projectId, siteId, limit);
    if (source === 'priority_pool' || poolIds.length >= limit) {
      return poolIds.slice(0, limit);
    }

    const gscIds = await this.pickGscKeywordIds(
      organizationId,
      projectId,
      siteId,
      limit - poolIds.length,
      new Set(poolIds),
    );
    return [...poolIds, ...gscIds].slice(0, limit);
  }

  private async pickPoolKeywordIds(
    organizationId: string,
    projectId: string,
    siteId: string,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.prisma.keywordEntry.findMany({
      where: {
        organizationId,
        projectId,
        deletedAt: null,
        status: { in: [KeywordStatus.PENDING, KeywordStatus.APPROVED] },
        OR: [{ siteId }, { siteId: null }],
      },
      select: { id: true },
      orderBy: [{ priorityScore: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  private async pickGscKeywordIds(
    organizationId: string,
    projectId: string,
    siteId: string,
    limit: number,
    excludeIds: Set<string> = new Set(),
  ): Promise<string[]> {
    const discovered = await this.gscService.getDiscoveredQueries(organizationId, projectId, siteId);
    const picked: string[] = [];

    for (const item of discovered) {
      if (picked.length >= limit) break;

      const keywordId = await this.ensureKeywordForGscQuery(
        organizationId,
        projectId,
        siteId,
        item.query,
      );
      if (!keywordId || excludeIds.has(keywordId) || picked.includes(keywordId)) {
        continue;
      }
      picked.push(keywordId);
    }

    return picked;
  }

  private async ensureKeywordForGscQuery(
    organizationId: string,
    projectId: string,
    siteId: string,
    query: string,
  ): Promise<string | null> {
    const normalized = query.trim();
    if (!normalized) return null;

    const existing = await this.prisma.keywordEntry.findFirst({
      where: {
        organizationId,
        projectId,
        deletedAt: null,
        keyword: { equals: normalized, mode: 'insensitive' },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status === KeywordStatus.ARCHIVED || existing.status === KeywordStatus.USED) {
        return null;
      }
      return existing.id;
    }

    const created = await this.prisma.keywordEntry.create({
      data: {
        organizationId,
        projectId,
        siteId,
        keyword: normalized,
        source: KeywordSource.GSC,
        status: KeywordStatus.PENDING,
        businessValueScore: 0.65,
        contentFitScore: 0.6,
        notes: '自动生产：来自 Google 搜索表现',
      },
      select: { id: true },
    });

    return created.id;
  }
}
