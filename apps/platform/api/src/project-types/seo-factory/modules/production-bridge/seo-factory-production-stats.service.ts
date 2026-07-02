/**
 * seo-factory 企业生产统计 Port 实现。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import type { ProductionStatsPort, ProjectProductionStats } from '@wm/platform-sdk';
import { isPendingHumanReview } from '@wm/shared-core';
import { PrismaService } from '../../../../core/database/prisma.service';
import { registerProductionStatsPort } from '../../../../core/organization/production-stats.registry';
import { ProjectAccessService } from '../../../../modules/project/project-access.service';
import { canReviewInSeoProject } from '../../../../modules/project/project-notification.util';

@Injectable()
export class SeoFactoryProductionStatsService implements ProductionStatsPort, OnModuleInit {
  readonly projectType = 'seo-factory';

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  onModuleInit(): void {
    registerProductionStatsPort(this);
  }

  supportsOrgDashboard(): boolean {
    return true;
  }

  async getProjectProductionStats(
    organizationId: string,
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectProductionStats> {
    const jobWhere = { organizationId, projectId };
    const activeStatusFilter = { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] };

    const [
      completedJobs,
      activeJobs,
      failedJobs,
      pendingBriefCount,
      ymylCandidates,
      publishCandidates,
      staleDraftCandidates,
      myAssignedCount,
      member,
    ] = await Promise.all([
      this.prisma.articleJob.count({ where: { ...jobWhere, status: 'COMPLETED' } }),
      this.prisma.articleJob.count({ where: { ...jobWhere, status: activeStatusFilter } }),
      this.prisma.articleJob.count({ where: { ...jobWhere, status: 'FAILED' } }),
      this.prisma.articleJob.count({
        where: {
          ...jobWhere,
          status: 'DRAFTING',
          briefData: { path: ['approvalStatus'], equals: 'pending' },
        },
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
      this.prisma.articleJob.findMany({
        where: { ...jobWhere, status: 'COMPLETED', outputUrl: { not: null } },
        select: { seoCheckData: true },
      }),
      this.prisma.articleJob.findMany({
        where: { ...jobWhere, status: { notIn: ['FAILED', 'QUEUED'] } },
        select: { draftData: true },
        take: 200,
      }),
      this.prisma.articleJobAssignee.count({
        where: {
          userId: actorUserId,
          job: { ...jobWhere, status: activeStatusFilter },
        },
      }),
      this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actorUserId } },
        select: { id: true, role: true },
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

    const staleDraftCount = staleDraftCandidates.filter((row) => {
      const draft = row.draftData as { stale?: boolean } | null;
      return draft?.stale === true;
    }).length;

    let myReviewPendingCount = 0;
    if (member) {
      const perms = await this.projectAccess.resolveMemberPermissions(
        member.id,
        member.role,
        this.projectType,
      );
      if (canReviewInSeoProject(perms)) {
        myReviewPendingCount = pendingBriefCount + pendingReviewCount;
      }
    }

    return {
      completedJobs,
      activeJobs,
      failedJobs,
      pendingBriefCount,
      pendingReviewCount,
      pendingPublishCount,
      staleDraftCount,
      myAssignedCount,
      myReviewPendingCount,
    };
  }
}
