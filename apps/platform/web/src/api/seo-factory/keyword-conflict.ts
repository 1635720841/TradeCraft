import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/types";

export type KeywordConflictReason = "exact" | "substring" | "similar";

export interface KeywordConflictItem {
  jobId: string;
  keyword: string;
  status: string;
  reason: KeywordConflictReason;
}

export interface KeywordCannibalizationWarning {
  code: "KEYWORD_CANNIBALIZATION";
  message: string;
  jobId: string;
  keyword: string;
  status: string;
  reason: KeywordConflictReason;
}

export async function getSiteKeywordConflicts(
  projectId: string,
  siteId: string,
  keyword: string
): Promise<KeywordConflictItem[]> {
  const res = await http.request<WmApiResponse<{ conflicts: KeywordConflictItem[] }>>(
    "get",
    `/api/v1/projects/${projectId}/sites/${siteId}/keyword-conflicts`,
    { params: { keyword } }
  );
  return res.data.conflicts;
}
