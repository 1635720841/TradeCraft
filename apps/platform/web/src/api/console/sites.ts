/**
 * Console 全站站点总览 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type { SiteGscListSummary } from "@/api/seo-factory/types";
import type { ConsoleSiteRowBase } from "./site-row";

export interface ConsoleSiteOverviewRow extends ConsoleSiteRowBase {
  projectStatus: string;
  cmsType: string | null;
  cmsConfigured: boolean;
  profileReady: boolean;
  gsc: SiteGscListSummary;
  jobCount: number;
  createdAt: string;
}

export async function listConsoleSiteOverview(options?: {
  page?: number;
  limit?: number;
  keyword?: string;
  organizationId?: string;
  projectId?: string;
  profileReady?: "true" | "false";
  gscConnected?: "true" | "false";
}): Promise<{ items: ConsoleSiteOverviewRow[]; page: number; limit: number; total: number }> {
  const params: Record<string, string | number> = {};
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;
  if (options?.keyword) params.keyword = options.keyword;
  if (options?.organizationId) params.organizationId = options.organizationId;
  if (options?.projectId) params.projectId = options.projectId;
  if (options?.profileReady) params.profileReady = options.profileReady;
  if (options?.gscConnected) params.gscConnected = options.gscConnected;

  const res = await http.request<WmApiResponse<ConsoleSiteOverviewRow[]>>(
    "get",
    "/api/v1/console/sites",
    { params }
  );
  const pagination = (res.meta as { pagination?: { page: number; limit: number; total: number } })
    ?.pagination;
  return {
    items: res.data ?? [],
    page: pagination?.page ?? 1,
    limit: pagination?.limit ?? 20,
    total: pagination?.total ?? res.data?.length ?? 0
  };
}
