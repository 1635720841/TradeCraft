/**
 * 企业级内容生产看板：按 project-type Port 聚合可进入项目统计。
 */

import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { getProductionStatsPort, listProductionStatsPorts } from '../../core/organization/production-stats.registry';
import { BillingService } from '../billing/billing.service';
import { ProjectAccessService } from '../project/project-access.service';
import { buildProjectEnterPath } from '../project/project-navigation.util';

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

    const supportedTypes = new Set(listProductionStatsPorts().map((port) => port.projectType));

    const rows = await this.prisma.project.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        projectType: { in: [...supportedTypes] },
      },
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
      const port = getProductionStatsPort(project.projectType);
      if (!port?.supportsOrgDashboard()) continue;

      const stats = await port.getProjectProductionStats(
        organizationId,
        project.id,
        ctx.userId,
      );
      const enterPath = buildProjectEnterPath(project.id, project.projectType);
      if (!enterPath) continue;

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
        enterPath,
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
}
