/**
 * Console API 共享类型。
 */

import type { WmPaginationMeta } from "@/api/platform/types";

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

export interface CreateTenantResult {
  organization: TenantDetail;
  adminUser: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    organizationId: string;
    createdAt: string;
  };
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

export interface AuditLogListResult {
  items: AuditLogItem[];
  pagination: WmPaginationMeta;
}

export interface ConsoleOverview {
  highQuotaAlerts: Array<{
    id: string;
    name: string;
    usagePercent: number;
    remaining: number;
    periodQuota: number;
  }>;
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

export interface BillingChangeRequestItem {
  id: string;
  organizationId: string;
  organizationName?: string;
  currentPlanName?: string | null;
  requestedById: string;
  type: "RENEW" | "UPGRADE" | "TOPUP";
  targetPlanId?: string | null;
  topUpAmount?: number | null;
  message?: string | null;
  status: string;
  createdAt: string;
}

export interface ImpersonateResult {
  accessToken: string;
  expires: string;
  targetEmail: string;
}
