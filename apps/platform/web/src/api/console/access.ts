/**
 * Console 访问控制 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type {
  ConsoleUserItem,
  ConsoleUserListResult,
  ConsoleUserPermissions,
  PermissionDefinition,
  UserMenuConfig
} from "./types";

export async function listConsoleUsers(
  page = 1,
  limit = 50,
  keyword?: string
): Promise<ConsoleUserListResult> {
  const res = await http.request<WmApiResponse<ConsoleUserItem[]>>(
    "get",
    "/api/v1/console/users",
    { params: { page, limit, keyword: keyword || undefined } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

export async function getUserMenus(userId: string): Promise<UserMenuConfig> {
  const res = await http.request<WmApiResponse<UserMenuConfig>>(
    "get",
    `/api/v1/console/users/${userId}/menus`
  );
  return res.data;
}

export async function setUserMenus(userId: string, menuIds: string[]): Promise<UserMenuConfig> {
  const res = await http.request<WmApiResponse<UserMenuConfig>>(
    "put",
    `/api/v1/console/users/${userId}/menus`,
    { data: { menuIds } }
  );
  return res.data;
}

export async function listConsolePermissions(): Promise<PermissionDefinition[]> {
  const res = await http.request<WmApiResponse<PermissionDefinition[]>>(
    "get",
    "/api/v1/console/permissions"
  );
  return res.data ?? [];
}

export async function getConsoleUserPermissions(
  userId: string
): Promise<ConsoleUserPermissions> {
  const res = await http.request<WmApiResponse<ConsoleUserPermissions>>(
    "get",
    `/api/v1/console/users/${userId}/permissions`
  );
  return res.data;
}

export async function setConsoleUserPermissions(
  userId: string,
  permissionIds: string[]
): Promise<ConsoleUserPermissions> {
  const res = await http.request<WmApiResponse<ConsoleUserPermissions>>(
    "put",
    `/api/v1/console/users/${userId}/permissions`,
    { data: { permissionIds } }
  );
  return res.data;
}
