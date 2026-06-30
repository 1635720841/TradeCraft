/**
 * 企业管理 API（/api/v1/org）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface QuotaSummary {
  planName: string;
  monthlyQuota: number;
  periodQuota: number;
  usedThisMonth: number;
  inFlightJobs: number;
  reservedTotal: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  subscriptionStatus?: string;
  subscriptionActive?: boolean;
  daysRemaining?: number;
}

export interface OrganizationProfile {
  id: string;
  type: string;
  status: string;
  name: string;
  planId: string | null;
  planName: string;
  monthlyArticleQuota: number;
  articleQuotaBonus: number;
  subscriptionStatus: string;
  billingCycle: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  quota: QuotaSummary;
}

export interface OrganizationMember {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER" | "SUPER_ADMIN" | "PLATFORM_OPERATOR";
  status?: string;
  createdAt: string;
}

export interface UpdateOrganizationPayload {
  name?: string;
}

export interface CreateMemberPayload {
  email: string;
  password: string;
  name?: string;
  role?: "ADMIN" | "MEMBER";
}

export interface UpdateMemberPayload {
  name?: string;
  role?: "ADMIN" | "MEMBER";
}

/** 获取当前企业信息与配额 */
export async function getOrganizationProfile(): Promise<OrganizationProfile> {
  const res = await http.request<WmApiResponse<OrganizationProfile>>(
    "get",
    "/api/v1/org/profile"
  );
  return res.data;
}

/** 更新企业资料 */
export async function updateOrganizationProfile(
  payload: UpdateOrganizationPayload
): Promise<Pick<OrganizationProfile, "id" | "name" | "planName" | "monthlyArticleQuota" | "createdAt">> {
  const res = await http.request<
    WmApiResponse<
      Pick<OrganizationProfile, "id" | "name" | "planName" | "monthlyArticleQuota" | "createdAt">
    >
  >("patch", "/api/v1/org/profile", { data: payload });
  return res.data;
}

/** 成员列表（分页） */
export async function listOrganizationMembers(
  page = 1,
  limit = 100
): Promise<{
  items: OrganizationMember[];
  pagination: { page: number; limit: number; total: number };
}> {
  const res = await http.request<
    WmApiResponse<OrganizationMember[]> & {
      meta?: { pagination?: { page: number; limit: number; total: number } };
    }
  >("get", "/api/v1/org/members", { params: { page, limit } });
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

export interface InviteMemberPayload {
  email: string;
  name?: string;
  role?: "ADMIN" | "MEMBER";
}

/** 邀请成员（邮件） */
export async function inviteOrganizationMember(
  payload: InviteMemberPayload
): Promise<{ id: string; email: string; status: string }> {
  const res = await http.request<WmApiResponse<{ id: string; email: string; status: string }>>(
    "post",
    "/api/v1/org/members/invite",
    { data: payload }
  );
  return res.data;
}

/** 重发邀请 */
export async function resendMemberInvite(email: string) {
  const res = await http.request<WmApiResponse<{ email: string }>>(
    "post",
    `/api/v1/org/members/${encodeURIComponent(email)}/resend-invite`
  );
  return res.data;
}

/** 撤销邀请 */
export async function revokeMemberInvite(email: string) {
  const res = await http.request<WmApiResponse<{ ok: boolean }>>(
    "delete",
    `/api/v1/org/members/${encodeURIComponent(email)}/invite`
  );
  return res.data;
}

/** 创建成员（密码，开发/备用） */
export async function createOrganizationMember(
  payload: CreateMemberPayload
): Promise<OrganizationMember> {
  const res = await http.request<WmApiResponse<OrganizationMember>>(
    "post",
    "/api/v1/org/members",
    { data: payload }
  );
  return res.data;
}

/** 更新成员 */
export async function updateOrganizationMember(
  userId: string,
  payload: UpdateMemberPayload
): Promise<OrganizationMember> {
  const res = await http.request<WmApiResponse<OrganizationMember>>(
    "patch",
    `/api/v1/org/members/${userId}`,
    { data: payload }
  );
  return res.data;
}

/** 禁用/启用成员 */
export async function updateOrganizationMemberStatus(
  userId: string,
  status: "ACTIVE" | "DISABLED"
): Promise<OrganizationMember> {
  const res = await http.request<WmApiResponse<OrganizationMember>>(
    "patch",
    `/api/v1/org/members/${userId}/status`,
    { data: { status } }
  );
  return res.data;
}

/** 删除成员（不可恢复，同时移出所有项目） */
export async function deleteOrganizationMember(
  userId: string
): Promise<{ id: string; email: string }> {
  const res = await http.request<WmApiResponse<{ id: string; email: string }>>(
    "delete",
    `/api/v1/org/members/${userId}`
  );
  return res.data;
}
