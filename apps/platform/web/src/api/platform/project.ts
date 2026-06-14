/**
 * 平台项目 API。
 *
 * 边界：
 * - 不负责：UI 展示（见 views/platform/）
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "./types";

export interface ProjectItem {
  id: string;
  name: string;
  projectType: string;
  status: string;
  createdAt?: string;
}

export interface ProjectDetail extends ProjectItem {
  config?: Record<string, unknown> | null;
  updatedAt?: string;
}

export interface ProjectListResult {
  items: ProjectItem[];
  pagination: WmPaginationMeta;
}

export interface CreateProjectPayload {
  name: string;
  projectType: "seo-factory";
}

/** 获取企业下项目列表（分页） */
export async function listProjects(
  page = 1,
  limit = 20
): Promise<ProjectListResult> {
  const res = await http.request<WmApiResponse<ProjectItem[]>>(
    "get",
    "/api/v1/platform/projects",
    { params: { page, limit } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

/** 项目详情 */
export async function getProject(projectId: string): Promise<ProjectDetail> {
  const res = await http.request<WmApiResponse<ProjectDetail>>(
    "get",
    `/api/v1/platform/projects/${projectId}`
  );
  return res.data;
}

/** 创建项目 */
export async function createProject(payload: CreateProjectPayload): Promise<ProjectItem> {
  const res = await http.request<WmApiResponse<ProjectItem>>(
    "post",
    "/api/v1/platform/projects",
    { data: payload }
  );
  return res.data;
}

/** 归档项目 */
export async function archiveProject(projectId: string): Promise<ProjectItem> {
  const res = await http.request<WmApiResponse<ProjectItem>>(
    "patch",
    `/api/v1/platform/projects/${projectId}/archive`
  );
  return res.data;
}
