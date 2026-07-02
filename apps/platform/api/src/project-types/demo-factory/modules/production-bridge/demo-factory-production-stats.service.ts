/**
 * demo-factory 企业生产统计 Port（空实现）。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ProductionStatsPort, ProjectProductionStats } from '@wm/platform-sdk';
import { registerProductionStatsPort } from '../../../../core/organization/production-stats.registry';

const EMPTY_STATS: ProjectProductionStats = {
  completedJobs: 0,
  activeJobs: 0,
  failedJobs: 0,
  pendingBriefCount: 0,
  pendingReviewCount: 0,
  pendingPublishCount: 0,
  staleDraftCount: 0,
  myAssignedCount: 0,
  myReviewPendingCount: 0,
};

@Injectable()
export class DemoFactoryProductionStatsService implements ProductionStatsPort, OnModuleInit {
  readonly projectType = 'demo-factory';

  onModuleInit(): void {
    registerProductionStatsPort(this);
  }

  supportsOrgDashboard(): boolean {
    return true;
  }

  async getProjectProductionStats(): Promise<ProjectProductionStats> {
    return { ...EMPTY_STATS };
  }
}
