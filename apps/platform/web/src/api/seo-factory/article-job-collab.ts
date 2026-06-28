/**
 * 文章任务协作 API。
 */

import { http } from "@/utils/http";
import { seoFactoryApiPath } from "./paths";
import type { WmApiResponse } from "@/api/platform/types";

export interface JobComment {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
  author?: { email: string; name: string | null } | null;
}

export interface JobAssignee {
  id: string;
  userId: string;
  user?: { email: string; name: string | null } | null;
}

function base(projectId: string, jobId: string) {
  return seoFactoryApiPath(projectId, `article-jobs/${jobId}`);
}

export async function listJobComments(
  projectId: string,
  jobId: string
): Promise<JobComment[]> {
  const res = await http.request<WmApiResponse<JobComment[]>>(
    "get",
    `${base(projectId, jobId)}/comments`
  );
  return res.data ?? [];
}

export async function addJobComment(projectId: string, jobId: string, body: string) {
  const res = await http.request<WmApiResponse<JobComment>>(
    "post",
    `${base(projectId, jobId)}/comments`,
    { data: { body } }
  );
  return res.data;
}

export async function listJobAssignees(
  projectId: string,
  jobId: string
): Promise<JobAssignee[]> {
  const res = await http.request<WmApiResponse<JobAssignee[]>>(
    "get",
    `${base(projectId, jobId)}/assignees`
  );
  return res.data ?? [];
}

export async function assignJobUser(
  projectId: string,
  jobId: string,
  userId: string
) {
  const res = await http.request<WmApiResponse<JobAssignee>>(
    "post",
    `${base(projectId, jobId)}/assignees`,
    { data: { userId } }
  );
  return res.data;
}

export async function unassignJobUser(
  projectId: string,
  jobId: string,
  userId: string
) {
  await http.request("delete", `${base(projectId, jobId)}/assignees/${userId}`);
}
