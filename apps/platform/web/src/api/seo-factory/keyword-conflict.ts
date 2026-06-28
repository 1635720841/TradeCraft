import { http } from "@/utils/http";
import { seoFactoryApiPath } from "./paths";
import type { WmApiResponse } from "./types";

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
    seoFactoryApiPath(projectId, `sites/${siteId}/keyword-conflicts`),
    { params: { keyword } }
  );
  return res.data.conflicts;
}
