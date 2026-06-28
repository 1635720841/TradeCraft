/**
 * 平台运营控制台 API（/api/v1/console）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "@/api/platform/types";

export interface TenantItem {
  id: string;
  name: string;
  status: string;
  planId: string | null;
  planName: string;
  subscriptionStatus: string;
  billingCycle: string;
  monthlyArticleQuota: number;
  articleQuotaBonus: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  accounts: Array<{ email: string; name: string | null; role: string }>;
}

export interface TenantListResult {
  items: TenantItem[];
  pagination: WmPaginationMeta;
}

export interface CreateTenantPayload {
  organizationName: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
  planName?: string;
  monthlyArticleQuota?: number;
  billingCycle?: string;
  subscriptionStatus?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}

export interface UpdateTenantPayload {
  name?: string;
  planName?: string;
  monthlyArticleQuota?: number;
  billingCycle?: string;
  subscriptionStatus?: string;
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}

export interface ConsoleUserItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
}

export interface ConsoleUserListResult {
  items: ConsoleUserItem[];
  pagination: WmPaginationMeta;
}

export interface MenuDefinition {
  id: string;
  title: string;
  routePath: string;
  permissionId?: string;
  targetRoles: string[];
  sortOrder: number;
  enabled?: boolean;
}

export interface UserMenuConfig {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    organizationId: string;
  };
  customized: boolean;
  menus: MenuDefinition[];
}

export interface AuditLogItem {
  id: string;
  organizationId: string | null;
  organizationName?: string | null;
  actorUserId: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  traceId: string | null;
  createdAt: string;
}

export interface ConsoleOverview {
  totalTenants: number;
  byStatus: Record<string, number>;
  highQuotaAlerts: Array<{
    id: string;
    name: string;
    usagePercent: number;
    remaining: number;
    periodQuota: number;
  }>;
  recentTenants: Array<{
    id: string;
    name: string;
    planName: string;
    subscriptionStatus: string;
  }>;
}

export interface TenantMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export interface TenantDetail extends TenantItem {
  type?: string;
  quota?: {
    periodQuota: number;
    reservedTotal: number;
    remaining: number;
    monthlyQuota: number;
  };
  members?: TenantMember[];
}

export interface PermissionDefinition {
  id: string;
  name: string;
  module: string;
  description?: string;
  sortOrder: number;
}

export interface ConsoleUserPermissions {
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

const AUDIT_ACTION_OPTIONS = [
  { value: "auth.login", label: "用户登录" },
  { value: "console.tenant.create", label: "创建租户" },
  { value: "console.tenant.update", label: "更新租户" },
  { value: "console.tenant.renew", label: "租户续期" },
  { value: "console.tenant.quota-topup", label: "租户加购配额" },
  { value: "console.menu.update", label: "菜单配置" },
  { value: "console.prompt.update", label: "Prompt 更新" },
  { value: "console.permission.grant", label: "平台权限授予" },
  { value: "org.member.create", label: "添加成员" },
  { value: "org.member.update", label: "编辑成员" },
  { value: "org.member.grant", label: "成员权限授予" },
  { value: "org.profile.update", label: "企业资料更新" },
  { value: "project.create", label: "创建项目" },
  { value: "project.update", label: "更新项目" },
  { value: "project.archive", label: "归档项目" },
  { value: "project.delete", label: "删除项目" },
  { value: "project.member.add", label: "添加项目成员" },
  { value: "project.member.update", label: "编辑项目成员" },
  { value: "project.member.remove", label: "移除项目成员" },
  { value: "project.member.grant", label: "项目成员授权" }
] as const;

export { AUDIT_ACTION_OPTIONS };

/** 运营概览 */
export async function getConsoleOverview(): Promise<ConsoleOverview> {
  const res = await http.request<WmApiResponse<ConsoleOverview>>(
    "get",
    "/api/v1/console/overview"
  );
  return res.data;
}

export interface AuditLogListResult {
  items: AuditLogItem[];
  pagination: WmPaginationMeta;
}

/** 租户列表 */
export async function listTenants(
  page = 1,
  limit = 20,
  keyword?: string
): Promise<TenantListResult> {
  const res = await http.request<WmApiResponse<TenantItem[]>>(
    "get",
    "/api/v1/console/tenants",
    { params: { page, limit, keyword: keyword || undefined } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

/** 创建租户 */
export async function createTenant(payload: CreateTenantPayload) {
  const res = await http.request<WmApiResponse<{ organization: unknown; adminUser: unknown }>>(
    "post",
    "/api/v1/console/tenants",
    { data: payload }
  );
  return res.data;
}

/** 获取租户详情 */
export async function getTenant(organizationId: string): Promise<TenantDetail> {
  const res = await http.request<WmApiResponse<TenantDetail>>(
    "get",
    `/api/v1/console/tenants/${organizationId}`
  );
  return res.data;
}

/** 更新租户 */
export async function updateTenant(organizationId: string, payload: UpdateTenantPayload) {
  const res = await http.request<WmApiResponse<unknown>>(
    "patch",
    `/api/v1/console/tenants/${organizationId}`,
    { data: payload }
  );
  return res.data;
}

/** 租户续期 */
export async function renewTenant(organizationId: string) {
  const res = await http.request<WmApiResponse<unknown>>(
    "post",
    `/api/v1/console/tenants/${organizationId}/renew`
  );
  return res.data;
}

/** 租户加购配额 */
export async function addTenantQuotaTopUp(
  organizationId: string,
  amount: number,
  note?: string
) {
  const res = await http.request<WmApiResponse<unknown>>(
    "post",
    `/api/v1/console/tenants/${organizationId}/quota-topup`,
    { data: { amount, note } }
  );
  return res.data;
}

/** 用户列表（菜单配置） */
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

/** 获取用户菜单配置 */
export async function getUserMenus(userId: string): Promise<UserMenuConfig> {
  const res = await http.request<WmApiResponse<UserMenuConfig>>(
    "get",
    `/api/v1/console/users/${userId}/menus`
  );
  return res.data;
}

/** 设置用户菜单 */
export async function setUserMenus(userId: string, menuIds: string[]): Promise<UserMenuConfig> {
  const res = await http.request<WmApiResponse<UserMenuConfig>>(
    "put",
    `/api/v1/console/users/${userId}/menus`,
    { data: { menuIds } }
  );
  return res.data;
}

/** 平台可授予权限目录（超管） */
export async function listConsolePermissions(): Promise<PermissionDefinition[]> {
  const res = await http.request<WmApiResponse<PermissionDefinition[]>>(
    "get",
    "/api/v1/console/permissions"
  );
  return res.data ?? [];
}

/** 获取用户权限配置（超管，用于平台运营账号） */
export async function getConsoleUserPermissions(
  userId: string
): Promise<ConsoleUserPermissions> {
  const res = await http.request<WmApiResponse<ConsoleUserPermissions>>(
    "get",
    `/api/v1/console/users/${userId}/permissions`
  );
  return res.data;
}

/** 设置用户权限（超管，用于平台运营账号） */
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

/** 审计日志 */
export async function listAuditLogs(
  page = 1,
  limit = 50,
  filters?: {
    organizationId?: string;
    actorUserId?: string;
    actorKeyword?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<AuditLogListResult> {
  const res = await http.request<WmApiResponse<AuditLogItem[]>>(
    "get",
    "/api/v1/console/audit-logs",
    {
      params: {
        page,
        limit,
        organizationId: filters?.organizationId || undefined,
        actorUserId: filters?.actorUserId || undefined,
        actorKeyword: filters?.actorKeyword || undefined,
        action: filters?.action || undefined,
        dateFrom: filters?.dateFrom || undefined,
        dateTo: filters?.dateTo || undefined
      }
    }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}
