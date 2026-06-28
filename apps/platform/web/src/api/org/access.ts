/**
 * 企业权限 API（成员授权 + 权限目录）。
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

/** 获取权限目录（含角色默认与隐含关系） */
export async function listPermissionCatalog(): Promise<PermissionCatalogResult> {
  const res = await http.request<
    WmApiResponse<PermissionDefinition[]> & {
      meta?: {
        accessMeta?: PermissionCatalogResult["accessMeta"];
      };
    }
  >("get", "/api/v1/org/permissions");
  return {
    catalog: res.data ?? [],
    accessMeta: res.meta?.accessMeta
  };
}

/** 获取成员权限 */
export async function getMemberPermissions(
  userId: string
): Promise<MemberPermissionsResult> {
  const res = await http.request<WmApiResponse<MemberPermissionsResult>>(
    "get",
    `/api/v1/org/members/${userId}/permissions`
  );
  return res.data;
}

/** 设置成员权限 */
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
