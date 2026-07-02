/**
 * 企业生产看板统计 Port：各 project-type 插件实现。
 */

export interface ProjectProductionStats {
  completedJobs: number;
  activeJobs: number;
  failedJobs: number;
  pendingBriefCount: number;
  pendingReviewCount: number;
  pendingPublishCount: number;
  staleDraftCount: number;
  myAssignedCount: number;
  myReviewPendingCount: number;
}

export interface ProductionStatsPort {
  readonly projectType: string;
  supportsOrgDashboard(): boolean;
  getProjectProductionStats(
    organizationId: string,
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectProductionStats>;
}
