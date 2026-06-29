/**
 * 企业级内容生产看板：聚合可进入的 seo-factory 项目统计。
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BillingService } from '../billing/billing.service';
import { ProjectAccessService } from '../project/project-access.service';
import { canReviewInSeoProject } from '../project/project-notification.util';
import { isPendingHumanReview } from '../../project-types/seo-factory/modules/content-review/ymyl-detect.util';

export interface OrgProductionProjectSummary {
  id: string;
  name: string;
  completedJobs: number;
  activeJobs: number;
  failedJobs: number;
  pendingBriefCount: number;
  pendingReviewCount: number;
  pendingPublishCount: number;
  staleDraftCount: number;
  enterPath: string;
}

@Injectable()
export class OrgProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly billingService: BillingService,
  ) {}

  async getSummary(ctx: RequestContext) {
    const organizationId = ctx.organizationId;
    const quota = await this.billingService.getQuotaSummary(organizationId);

    const rows = await this.prisma.project.findMany({
      where: { organizationId, projectType: 'seo-factory', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        status: true,
        accessStart: true,
        accessEnd: true,
        projectType: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await this.projectAccess.enrichProjectListItems(rows, ctx);
    const enterable = enriched.filter((p) => p.canEnter);

    const projectSummaries: OrgProductionProjectSummary[] = [];
    const totals = {
      completedJobs: 0,
      activeJobs: 0,
      failedJobs: 0,
      pendingBriefCount: 0,
      pendingReviewCount: 0,
      pendingPublishCount: 0,
      staleDraftCount: 0,
    };
    let myAssignedCount = 0;
    let myReviewPendingCount = 0;

    for (const project of enterable) {
      const stats = await this.getProjectProductionStats(
        organizationId,
        project.id,
        ctx.userId,
      );
      projectSummaries.push({
        id: project.id,
        name: project.name,
        completedJobs: stats.completedJobs,
        activeJobs: stats.activeJobs,
        failedJobs: stats.failedJobs,
        pendingBriefCount: stats.pendingBriefCount,
        pendingReviewCount: stats.pendingReviewCount,
        pendingPublishCount: stats.pendingPublishCount,
        staleDraftCount: stats.staleDraftCount,
        enterPath: `/projects/${project.id}/seo-factory/overview`,
      });
      totals.completedJobs += stats.completedJobs;
      totals.activeJobs += stats.activeJobs;
      totals.failedJobs += stats.failedJobs;
      totals.pendingBriefCount += stats.pendingBriefCount;
      totals.pendingReviewCount += stats.pendingReviewCount;
      totals.pendingPublishCount += stats.pendingPublishCount;
      totals.staleDraftCount += stats.staleDraftCount;
      myAssignedCount += stats.myAssignedCount;
      myReviewPendingCount += stats.myReviewPendingCount;
    }

    const periodLabel = quota.periodStart
      ? `${quota.periodStart.slice(0, 10)} ~ ${quota.periodEnd.slice(0, 10)}`
      : '本账期';

    return {
      periodLabel,
      quota,
      totals,
      myTodos: { assignedCount: myAssignedCount, reviewPendingCount: myReviewPendingCount },
      projects: projectSummaries,
    };
  }

  private async getProjectProductionStats(
    organizationId: string,
    projectId: string,
    actorUserId: string,
  ) {
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
        'seo-factory',
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
