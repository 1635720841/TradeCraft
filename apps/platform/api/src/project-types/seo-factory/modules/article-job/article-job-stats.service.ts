/**
 * 文章任务项目统计：概览流水线计数与运营待办。
 */

import { Injectable } from '@nestjs/common';
import { KeywordStatus } from '@prisma/client';
import { isPendingHumanReview } from '@wm/shared-core';
import { PrismaService } from '../../../../core/database/prisma.service';
import { ProjectAccessService } from '../../../../modules/project/project-access.service';
import { canReviewInSeoProject } from '../../../../modules/project/project-notification.util';
import { siteHasWritingProfile } from '../../constants/site-settings';
import { ACTIVE_JOB_STATUSES } from '../../constants/article-job-status';
import { GscService } from '../gsc/gsc.service';
import { isArticleDraftStale, isCmsPublishFailed } from './article-job-stage.util';

@Injectable()
export class ArticleJobStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gscService: GscService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getProjectStats(
    organizationId: string,
    projectId: string,
    siteId?: string,
    actorUserId?: string,
  ) {
    const jobWhere = { organizationId, projectId, ...(siteId ? { siteId } : {}) };
    const siteWhere = { organizationId, projectId, ...(siteId ? { id: siteId } : {}) };
    const keywordWhere = {
      organizationId,
      projectId,
      ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
    };
    const activeStatusFilter = {
      in: [...ACTIVE_JOB_STATUSES],
    };

    const [totalJobs, completedJobs, failedJobs, activeJobs, queuedJobs, optimizingJobs, ymylCandidates, pendingBriefJobs, publishCandidates, staleDraftCandidates, siteRows, keywordTotalCount, keywordQueueableCount, keywordUnclusteredCount] =
      await Promise.all([
        this.prisma.articleJob.count({ where: jobWhere }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'COMPLETED' },
        }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'FAILED' },
        }),
        this.prisma.articleJob.count({
          where: {
            ...jobWhere,
            status: activeStatusFilter,
          },
        }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'QUEUED' },
        }),
        this.prisma.articleJob.count({
          where: { ...jobWhere, status: 'OPTIMIZING' },
        }),
        this.prisma.articleJob.findMany({
          where: {
            ...jobWhere,
            status: 'COMPLETED',
            seoCheckData: {
              path: ['ymylReview', 'requires_human_review'],
              equals: true,
            },
          },
          select: { seoCheckData: true },
        }),
        this.prisma.articleJob.count({
          where: {
            ...jobWhere,
            status: 'DRAFTING',
            briefData: {
              path: ['approvalStatus'],
              equals: 'pending',
            },
          },
        }),
        this.prisma.articleJob.findMany({
          where: {
            ...jobWhere,
            status: 'COMPLETED',
            outputUrl: { not: null },
          },
          select: { seoCheckData: true },
        }),
        this.prisma.articleJob.findMany({
          where: {
            ...jobWhere,
            status: { notIn: ['FAILED', 'QUEUED'] },
          },
          select: { draftData: true },
          take: 500,
        }),
        this.prisma.site.findMany({
          where: siteWhere,
          select: {
            settings: true,
            gscConnection: {
              select: { propertyUrl: true, managedByPlatform: true, lastSyncAt: true },
            },
          },
        }),
        this.prisma.keywordEntry.count({ where: keywordWhere }),
        this.prisma.keywordEntry.count({
          where: {
            ...keywordWhere,
            status: { in: [KeywordStatus.PENDING, KeywordStatus.APPROVED] },
          },
        }),
        this.prisma.keywordEntry.count({
          where: { ...keywordWhere, clusterId: null },
        }),
      ]);

    const pendingReviewCount = ymylCandidates.filter((row) =>
      isPendingHumanReview(row.seoCheckData),
    ).length;

    const pendingPublishCount = publishCandidates.filter((row) => {
      const cmsPublish = (row.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)
        ?.cmsPublish;
      return !cmsPublish?.postUrl;
    }).length;

    const cmsPublishFailedCount = publishCandidates.filter((row) =>
      isCmsPublishFailed(row.seoCheckData),
    ).length;

    const staleDraftCount = staleDraftCandidates.filter((row) =>
      isArticleDraftStale(row.draftData),
    ).length;

    const siteCount = siteRows.length;
    const sitesMissingProfileCount = siteRows.filter(
      (row) => !siteHasWritingProfile(row.settings),
    ).length;
    const isGscConnected = (row: (typeof siteRows)[number]) =>
      Boolean(row.gscConnection?.propertyUrl && row.gscConnection.managedByPlatform);

    const gscPendingSyncCount = siteRows.filter(
      (row) => isGscConnected(row) && !row.gscConnection?.lastSyncAt,
    ).length;
    const gscStaleSyncMs = 7 * 24 * 60 * 60 * 1000;
    const gscStaleSyncCount = siteRows.filter((row) => {
      const lastSyncAt = row.gscConnection?.lastSyncAt;
      if (!isGscConnected(row) || !lastSyncAt) return false;
      return Date.now() - lastSyncAt.getTime() > gscStaleSyncMs;
    }).length;

    const gscUnderperformingJobs =
      gscPendingSyncCount > 0
        ? []
        : await this.gscService.getUnderperformingJobs(organizationId, projectId, siteId);

    const gscDiscoveredQueries =
      gscPendingSyncCount > 0 || gscStaleSyncCount > 0
        ? []
        : await this.gscService.getDiscoveredQueries(organizationId, projectId, siteId);

    let myAssignedCount = 0;
    let canReviewInProject = false;
    if (actorUserId) {
      myAssignedCount = await this.prisma.articleJobAssignee.count({
        where: {
          userId: actorUserId,
          job: {
            organizationId,
            projectId,
            ...(siteId ? { siteId } : {}),
            status: activeStatusFilter,
          },
        },
      });

      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actorUserId } },
        select: { id: true, role: true },
      });
      if (member) {
        const project = await this.prisma.project.findFirst({
          where: { id: projectId, organizationId },
          select: { projectType: true },
        });
        if (project) {
          const perms = await this.projectAccessService.resolveMemberPermissions(
            member.id,
            member.role,
            project.projectType,
          );
          canReviewInProject = canReviewInSeoProject(perms);
        }
      }
    }

    const myReviewPendingCount = canReviewInProject
      ? pendingBriefJobs + pendingReviewCount
      : 0;

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      activeJobs,
      queuedJobs,
      optimizingJobs,
      pendingBriefCount: pendingBriefJobs,
      pendingPublishCount,
      cmsPublishFailedCount,
      pendingReviewCount,
      staleDraftCount,
      siteCount,
      sitesMissingProfileCount,
      gscPendingSyncCount,
      gscStaleSyncCount,
      gscUnderperformingCount: gscUnderperformingJobs.length,
      gscUnderperformingJobs,
      gscDiscoveredQueryCount: gscDiscoveredQueries.length,
      gscDiscoveredQueries: gscDiscoveredQueries.slice(0, 3),
      keywordTotalCount,
      keywordQueueableCount,
      keywordUnclusteredCount,
      myAssignedCount,
      myReviewPendingCount,
      canReviewInProject,
    };
  }
}
