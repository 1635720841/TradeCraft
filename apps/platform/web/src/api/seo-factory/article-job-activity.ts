/**
 * 文章任务活动流 API。
 */

import { http } from "@/utils/http";
import { seoFactoryApiPath } from "./paths";
import type { WmApiResponse } from "@/api/platform/types";

export interface JobActivityItem {
  id: string;
  type: string;
  summary: string;
  actorUserId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { email: string; name: string | null } | null;
}

export async function listJobActivity(
  projectId: string,
  jobId: string
): Promise<JobActivityItem[]> {
  const res = await http.request<WmApiResponse<JobActivityItem[]>>(
    "get",
    `${seoFactoryApiPath(projectId, `article-jobs/${jobId}`)}/activity`
  );
  return res.data ?? [];
}
