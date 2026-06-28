/**
 * 套餐能力常量（EntitlementsService / OrgQueueLimiter 共用）。
 */

export interface PlanEntitlements {
  maxProjects: number;
  maxConcurrentJobs: number;
  gscEnabled: boolean;
  semrushRpaEnabled: boolean;
  cmsPublishEnabled: boolean;
}

export const PLAN_ENTITLEMENTS: Record<string, PlanEntitlements> = {
  trial: {
    maxProjects: 2,
    maxConcurrentJobs: 2,
    gscEnabled: false,
    semrushRpaEnabled: true,
    cmsPublishEnabled: true,
  },
  standard: {
    maxProjects: 10,
    maxConcurrentJobs: 5,
    gscEnabled: true,
    semrushRpaEnabled: true,
    cmsPublishEnabled: true,
  },
  enterprise: {
    maxProjects: 100,
    maxConcurrentJobs: 20,
    gscEnabled: true,
    semrushRpaEnabled: true,
    cmsPublishEnabled: true,
  },
};

export function resolvePlanEntitlements(planName: string): PlanEntitlements {
  return PLAN_ENTITLEMENTS[planName] ?? PLAN_ENTITLEMENTS.trial;
}

export function maxConcurrentJobsForPlan(planName: string): number {
  return resolvePlanEntitlements(planName).maxConcurrentJobs;
}
