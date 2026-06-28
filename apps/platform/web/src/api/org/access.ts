/**
 * 企业权限 API（成员授权 + 权限目录）与项目访问申请。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface PermissionDefinition {
  id: string;
  name: string;
  module: string;
  description?: string;
  sortOrder: number;
}

export interface MemberPermissionsResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    organizationId: string;
    organizationName: string;
  };
  grants: string[];
  effectivePermissions: string[];
}

export interface PermissionCatalogResult {
  catalog: PermissionDefinition[];
  accessMeta?: {
    roleDefaultPermissions: Record<string, string[]>;
    permissionImplies: Record<string, string[]>;
  };
}

export interface AccessRequestItem {
  id: string;
  projectId: string;
  userId: string;
  message?: string | null;
  status: string;
  createdAt: string;
  user?: { email: string; name: string | null };
  project?: { name: string };
}

export async function listPermissionCatalog(): Promise<PermissionCatalogResult> {
  const res = await http.request<
    WmApiResponse<PermissionDefinition[]> & {
      meta?: { accessMeta?: PermissionCatalogResult["accessMeta"] };
    }
  >("get", "/api/v1/org/permissions");
  return { catalog: res.data ?? [], accessMeta: res.meta?.accessMeta };
}

export async function getMemberPermissions(userId: string): Promise<MemberPermissionsResult> {
  const res = await http.request<WmApiResponse<MemberPermissionsResult>>(
    "get",
    `/api/v1/org/members/${userId}/permissions`
  );
  return res.data;
}

export async function setMemberPermissions(
  userId: string,
  permissionIds: string[]
): Promise<MemberPermissionsResult> {
  const res = await http.request<WmApiResponse<MemberPermissionsResult>>(
    "put",
    `/api/v1/org/members/${userId}/permissions`,
    { data: { permissionIds } }
  );
  return res.data;
}

export async function createProjectAccessRequest(
  projectId: string,
  message?: string
): Promise<AccessRequestItem> {
  const res = await http.request<WmApiResponse<AccessRequestItem>>(
    "post",
    `/api/v1/org/projects/${projectId}/access-requests`,
    { data: { message } }
  );
  return res.data;
}

export async function listPendingAccessRequests(): Promise<AccessRequestItem[]> {
  const res = await http.request<WmApiResponse<AccessRequestItem[]>>(
    "get",
    "/api/v1/org/access-requests"
  );
  return res.data ?? [];
}

export async function approveAccessRequest(requestId: string, presetId?: string) {
  const res = await http.request<WmApiResponse<{ ok: boolean }>>(
    "post",
    `/api/v1/org/access-requests/${requestId}/approve`,
    { data: { presetId } }
  );
  return res.data;
}

export async function rejectAccessRequest(requestId: string) {
  const res = await http.request<WmApiResponse<{ ok: boolean }>>(
    "post",
    `/api/v1/org/access-requests/${requestId}/reject`
  );
  return res.data;
}
