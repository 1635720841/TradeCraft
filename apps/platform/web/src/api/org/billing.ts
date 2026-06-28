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

export interface QuotaTopUpResult {
  organizationId: string;
  articleQuotaBonus: number;
  amount: number;
}

export interface RenewPeriodResult {
  organizationId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
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

/** 续期当前账期 */
export async function renewBillingPeriod(): Promise<RenewPeriodResult> {
  const res = await http.request<WmApiResponse<RenewPeriodResult>>(
    "post",
    "/api/v1/org/billing/renew"
  );
  return res.data;
}

/** 加购配额 */
export async function addQuotaTopUp(
  amount: number,
  note?: string
): Promise<QuotaTopUpResult> {
  const res = await http.request<WmApiResponse<QuotaTopUpResult>>(
    "post",
    "/api/v1/org/billing/quota-topup",
    { data: { amount, note } }
  );
  return res.data;
}
