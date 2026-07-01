/**
 * 企业计费 API（/api/v1/org/billing）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "@/api/platform/types";

export interface CreditUsageItem {
  id: string;
  organizationId: string;
  projectId?: string | null;
  projectType?: string | null;
  serviceType: string;
  provider: string;
  tokensOrCount: number;
  estimatedCost: number;
  traceId?: string | null;
  createdAt: string;
}

export interface BillingUsageListResult {
  items: CreditUsageItem[];
  pagination: WmPaginationMeta;
}

export interface QuotaSummary {
  planName: string;
  monthlyQuota: number;
  usedThisMonth: number;
  inFlightJobs: number;
  reservedTotal: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyArticleQuota: number;
  billingCycle: string;
  sortOrder: number;
  isActive: boolean;
}

/** 获取用量记录（分页） */
export async function listBillingUsage(
  page = 1,
  limit = 20
): Promise<BillingUsageListResult> {
  const res = await http.request<WmApiResponse<CreditUsageItem[]>>(
    "get",
    "/api/v1/org/billing/usage",
    { params: { page, limit } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

/** 获取本月配额摘要 */
export async function getBillingQuota(): Promise<QuotaSummary> {
  const res = await http.request<WmApiResponse<QuotaSummary>>(
    "get",
    "/api/v1/org/billing/quota"
  );
  return res.data;
}

/** 获取可用套餐列表 */
export async function listBillingPlans(): Promise<SubscriptionPlan[]> {
  const res = await http.request<WmApiResponse<SubscriptionPlan[]>>(
    "get",
    "/api/v1/org/billing/plans"
  );
  return res.data ?? [];
}

export async function createBillingRequest(payload: {
  type: "RENEW" | "UPGRADE" | "TOPUP";
  targetPlanId?: string;
  topUpAmount?: number;
  message?: string;
}) {
  await http.request("post", "/api/v1/org/billing/requests", {
    data: payload,
    skipGlobalErrorToast: true
  });
}

export interface BillingRequestItem {
  id: string;
  type: "RENEW" | "UPGRADE" | "TOPUP";
  targetPlanId?: string | null;
  topUpAmount?: number | null;
  message?: string | null;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
}

export async function listBillingRequests(
  page = 1,
  limit = 50
): Promise<{
  items: BillingRequestItem[];
  pagination: { page: number; limit: number; total: number };
}> {
  const res = await http.request<
    WmApiResponse<BillingRequestItem[]> & {
      meta?: { pagination?: { page: number; limit: number; total: number } };
    }
  >("get", "/api/v1/org/billing/requests", { params: { page, limit } });
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

export interface OrgEntitlements {
  planName: string;
  maxProjects: number;
  maxConcurrentJobs: number;
  gscEnabled: boolean;
  semrushRpaEnabled: boolean;
  cmsPublishEnabled: boolean;
}

export async function getOrgEntitlements(): Promise<OrgEntitlements> {
  const res = await http.request<WmApiResponse<OrgEntitlements>>(
    "get",
    "/api/v1/org/billing/entitlements"
  );
  return res.data;
}

export async function downloadBillingUsageCsv() {
  const res = await http.request<Blob>("get", "/api/v1/org/billing/usage/export", {
    responseType: "blob"
  });
  const url = URL.createObjectURL(res);
  const a = document.createElement("a");
  a.href = url;
  a.download = "usage.csv";
  a.click();
  URL.revokeObjectURL(url);
}
