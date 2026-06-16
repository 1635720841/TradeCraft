/**
 * seo-factory 主题集群 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "./types";

export interface KeywordClusterItem {
  id: string;
  name: string;
  description?: string | null;
  pillarKeywordId?: string | null;
  pillarKeyword?: { id: string; keyword: string } | null;
  createdAt: string;
  updatedAt: string;
  keywordCount?: number;
  pendingCount?: number;
  usedCount?: number;
  progressPercent?: number;
}

function projectBase(projectId: string) {
  return `/api/v1/projects/${projectId}/keyword-clusters`;
}

export async function listKeywordClusters(
  projectId: string
): Promise<KeywordClusterItem[]> {
  const res = await http.request<WmApiResponse<KeywordClusterItem[]>>(
    "get",
    projectBase(projectId)
  );
  return res.data ?? [];
}

export async function createKeywordCluster(
  projectId: string,
  payload: { name: string; description?: string }
): Promise<KeywordClusterItem> {
  const res = await http.request<WmApiResponse<KeywordClusterItem>>(
    "post",
    projectBase(projectId),
    { data: payload }
  );
  return res.data;
}

export async function updateKeywordCluster(
  projectId: string,
  clusterId: string,
  payload: {
    name?: string;
    description?: string | null;
    pillarKeywordId?: string | null;
  }
): Promise<KeywordClusterItem> {
  const res = await http.request<WmApiResponse<KeywordClusterItem>>(
    "patch",
    `${projectBase(projectId)}/${clusterId}`,
    { data: payload }
  );
  return res.data;
}

export async function deleteKeywordCluster(
  projectId: string,
  clusterId: string
): Promise<void> {
  await http.request("delete", `${projectBase(projectId)}/${clusterId}`);
}

export async function assignKeywordsToCluster(
  projectId: string,
  clusterId: string,
  keywordIds: string[]
): Promise<{ assigned: number }> {
  const res = await http.request<WmApiResponse<{ assigned: number }>>(
    "post",
    `${projectBase(projectId)}/${clusterId}/assign-keywords`,
    { data: { keywordIds } }
  );
  return res.data;
}

export async function createJobsFromCluster(
  projectId: string,
  clusterId: string,
  siteId?: string
): Promise<{ created: number; skipped: number }> {
  const res = await http.request<
    WmApiResponse<{ created: number; skipped: number; jobs: unknown[] }>
  >("post", `${projectBase(projectId)}/${clusterId}/create-jobs`, {
    data: siteId ? { siteId } : {}
  });
  return { created: res.data.created, skipped: res.data.skipped };
}
