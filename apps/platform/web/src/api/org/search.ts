/**
 * 全局搜索 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface SearchResultGroup {
  type: "project" | "member" | "job" | "site" | "menu";
  label: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    path: string;
  }>;
}

export async function searchOrg(q: string, limit = 20): Promise<SearchResultGroup[]> {
  const res = await http.request<WmApiResponse<SearchResultGroup[]>>(
    "get",
    "/api/v1/org/search",
    { params: { q, limit } }
  );
  return res.data ?? [];
}
