/**
 * 平台计费 / 用量 API。
 *
 * 边界：
 * - 不负责：UI 展示（见 views/platform/BillingUsageView.vue）
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "./types";

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

/** 获取企业用量记录（分页） */
export async function listBillingUsage(
  page = 1,
  limit = 20
): Promise<BillingUsageListResult> {
  const res = await http.request<WmApiResponse<CreditUsageItem[]>>(
    "get",
    "/api/v1/platform/billing/usage",
    { params: { page, limit } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

/** 获取本月文章配额摘要 */
export async function getBillingQuota(): Promise<QuotaSummary> {
  const res = await http.request<WmApiResponse<QuotaSummary>>(
    "get",
    "/api/v1/platform/billing/quota"
  );
  return res.data;
}
