/**
 * 企业生产看板 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type { QuotaSummary } from "@/api/org/organization";

export interface OrgProductionTotals {
  completedJobs: number;
  activeJobs: number;
  failedJobs: number;
  pendingBriefCount: number;
  pendingReviewCount: number;
  pendingPublishCount: number;
  staleDraftCount: number;
}

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

export interface OrgProductionSummary {
  periodLabel: string;
  quota: QuotaSummary;
  totals: OrgProductionTotals;
  myTodos: { assignedCount: number; reviewPendingCount: number };
  projects: OrgProductionProjectSummary[];
}

export async function getOrgProductionSummary(): Promise<OrgProductionSummary> {
  const res = await http.request<WmApiResponse<OrgProductionSummary>>(
    "get",
    "/api/v1/org/production/summary"
  );
  return res.data;
}
