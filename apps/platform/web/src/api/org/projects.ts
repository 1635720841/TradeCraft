/**
 * 企业项目管理 API（/api/v1/org/projects）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "@/api/platform/types";

export type ProjectMyAccessStatus =
  | "usable"
  | "not_open"
  | "not_member"
  | "member_expired"
  | "archived";

export interface OrgProjectMemberPreview {
  userId: string;
  name: string | null;
  email: string;
}

export interface ProjectTypeDescriptor {
  type: string;
  label: string;
  workbenchReady: boolean;
  description: string;
  routePrefix: string;
}

export interface OrgProjectItem {
  id: string;
  name: string;
  projectType: string;
  status: string;
  accessStart: string | null;
  accessEnd: string | null;
  memberCount: number;
  memberPreview?: OrgProjectMemberPreview[];
  accessActive: boolean;
  isMember: boolean;
  memberAccessActive: boolean;
  myAccessStatus: ProjectMyAccessStatus;
  canEnter: boolean;
  canManage: boolean;
  workbenchReady?: boolean;
  enterPath?: string | null;
  enterBlockedReason?: string | null;
  effectivePermissions?: string[];
  createdAt: string;
}

export interface OrgProjectMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  orgRole: string;
  role: string;
  accessStart: string | null;
  accessEnd: string | null;
  accessActive?: boolean;
}

export interface OrgProjectDetail {
  id: string;
  name: string;
  projectType: string;
  status: string;
  accessStart: string | null;
  accessEnd: string | null;
  accessActive: boolean;
  isMember: boolean;
  memberAccessActive: boolean;
  myAccessStatus: ProjectMyAccessStatus;
  canEnter: boolean;
  canManage: boolean;
  workbenchReady?: boolean;
  enterPath?: string | null;
  enterBlockedReason?: string | null;
  effectivePermissions?: string[];
  createdAt: string;
  updatedAt: string;
  members: OrgProjectMember[];
}

export interface OrgProjectListResult {
  items: OrgProjectItem[];
  pagination: WmPaginationMeta;
}

export interface ProjectMemberPermissions {
  member: OrgProjectMember;
  grants: string[];
  effectivePermissions: string[];
  grantablePermissionIds: string[];
  roleDefaultPermissionIds: string[];
  grantablePermissions: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

export interface CreateOrgProjectPayload {
  name: string;
  projectType: string;
  accessStart?: string | null;
  accessEnd?: string | null;
}

export interface UpdateOrgProjectPayload {
  name?: string;
  accessStart?: string | null;
  accessEnd?: string | null;
}

export interface AddProjectMemberPayload {
  userId: string;
  role?: "OWNER" | "EDITOR" | "VIEWER";
  accessStart?: string | null;
  accessEnd?: string | null;
  permissionIds?: string[];
}

export interface UpdateProjectMemberPayload {
  role?: "OWNER" | "EDITOR" | "VIEWER";
  accessStart?: string | null;
  accessEnd?: string | null;
  permissionIds?: string[];
}

export async function listProjectTypeCatalog(): Promise<ProjectTypeDescriptor[]> {
  const res = await http.request<WmApiResponse<ProjectTypeDescriptor[]>>(
    "get",
    "/api/v1/org/projects/types/catalog"
  );
  return res.data ?? [];
}

export async function listOrgProjects(
  page = 1,
  limit = 20
): Promise<OrgProjectListResult> {
  const res = await http.request<WmApiResponse<OrgProjectItem[]>>(
    "get",
    "/api/v1/org/projects",
    { params: { page, limit } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

export async function getOrgProject(projectId: string): Promise<OrgProjectDetail> {
  const res = await http.request<WmApiResponse<OrgProjectDetail>>(
    "get",
    `/api/v1/org/projects/${projectId}`
  );
  return res.data;
}

export async function createOrgProject(
  payload: CreateOrgProjectPayload
): Promise<OrgProjectItem> {
  const res = await http.request<WmApiResponse<OrgProjectItem>>(
    "post",
    "/api/v1/org/projects",
    { data: payload }
  );
  return res.data;
}

export async function updateOrgProject(
  projectId: string,
  payload: UpdateOrgProjectPayload
): Promise<OrgProjectItem> {
  const res = await http.request<WmApiResponse<OrgProjectItem>>(
    "patch",
    `/api/v1/org/projects/${projectId}`,
    { data: payload }
  );
  return res.data;
}

export async function deleteOrgProject(projectId: string): Promise<{ id: string; name: string }> {
  const res = await http.request<WmApiResponse<{ id: string; name: string }>>(
    "delete",
    `/api/v1/org/projects/${projectId}`
  );
  return res.data;
}

export async function listProjectMembers(projectId: string): Promise<OrgProjectMember[]> {
  const res = await http.request<WmApiResponse<OrgProjectMember[]>>(
    "get",
    `/api/v1/org/projects/${projectId}/members`
  );
  return res.data ?? [];
}

export async function addProjectMember(
  projectId: string,
  payload: AddProjectMemberPayload
): Promise<OrgProjectMember> {
  const res = await http.request<WmApiResponse<OrgProjectMember>>(
    "post",
    `/api/v1/org/projects/${projectId}/members`,
    { data: payload }
  );
  return res.data;
}

export async function updateProjectMember(
  projectId: string,
  userId: string,
  payload: UpdateProjectMemberPayload
): Promise<OrgProjectMember> {
  const res = await http.request<WmApiResponse<OrgProjectMember>>(
    "patch",
    `/api/v1/org/projects/${projectId}/members/${userId}`,
    { data: payload }
  );
  return res.data;
}

export async function removeProjectMember(
  projectId: string,
  userId: string
): Promise<void> {
  await http.request<WmApiResponse<unknown>>(
    "delete",
    `/api/v1/org/projects/${projectId}/members/${userId}`
  );
}

export async function getProjectMemberPermissions(
  projectId: string,
  userId: string
): Promise<ProjectMemberPermissions> {
  const res = await http.request<WmApiResponse<ProjectMemberPermissions>>(
    "get",
    `/api/v1/org/projects/${projectId}/members/${userId}/permissions`
  );
  return res.data;
}

export async function setProjectMemberPermissions(
  projectId: string,
  userId: string,
  permissionIds: string[]
): Promise<ProjectMemberPermissions> {
  const res = await http.request<WmApiResponse<ProjectMemberPermissions>>(
    "put",
    `/api/v1/org/projects/${projectId}/members/${userId}/permissions`,
    { data: { permissionIds } }
  );
  return res.data;
}

export interface PermissionPreset {
  id: string;
  label: string;
  description?: string;
  permissions: string[];
}

export async function listPermissionPresets(): Promise<PermissionPreset[]> {
  const res = await http.request<WmApiResponse<PermissionPreset[]>>(
    "get",
    "/api/v1/org/projects/permission-presets"
  );
  return res.data ?? [];
}
