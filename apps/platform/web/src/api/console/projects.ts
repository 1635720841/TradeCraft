/**
 * Console 跨租户项目 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface ConsoleTenantProjectItem {
  id: string;
  name: string;
  projectType: string;
  status: string;
  siteCount: number;
  createdAt: string;
}

export async function listTenantProjects(organizationId: string): Promise<ConsoleTenantProjectItem[]> {
  const res = await http.request<WmApiResponse<ConsoleTenantProjectItem[]>>(
    "get",
    `/api/v1/console/tenants/${organizationId}/projects`
  );
  return res.data ?? [];
}
