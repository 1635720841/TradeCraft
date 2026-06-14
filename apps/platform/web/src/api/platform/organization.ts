/**
 * 平台企业 / 成员 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "./types";

export interface QuotaSummary {
  planName: string;
  monthlyQuota: number;
  usedThisMonth: number;
  inFlightJobs: number;
  reservedTotal: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  planName: string;
  monthlyArticleQuota: number;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  quota: QuotaSummary;
}

export interface OrganizationMember {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

export interface UpdateOrganizationPayload {
  name?: string;
  planName?: string;
  monthlyArticleQuota?: number;
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
    "/api/v1/platform/organization"
  );
  return res.data;
}

/** 更新企业信息（ADMIN） */
export async function updateOrganizationProfile(
  payload: UpdateOrganizationPayload
): Promise<Pick<OrganizationProfile, "id" | "name" | "planName" | "monthlyArticleQuota" | "createdAt">> {
  const res = await http.request<
    WmApiResponse<Pick<OrganizationProfile, "id" | "name" | "planName" | "monthlyArticleQuota" | "createdAt">>
  >("patch", "/api/v1/platform/organization", { data: payload });
  return res.data;
}

/** 成员列表（ADMIN） */
export async function listOrganizationMembers(): Promise<OrganizationMember[]> {
  const res = await http.request<WmApiResponse<OrganizationMember[]>>(
    "get",
    "/api/v1/platform/organization/members"
  );
  return res.data ?? [];
}

/** 邀请/创建成员（ADMIN） */
export async function createOrganizationMember(
  payload: CreateMemberPayload
): Promise<OrganizationMember> {
  const res = await http.request<WmApiResponse<OrganizationMember>>(
    "post",
    "/api/v1/platform/organization/members",
    { data: payload }
  );
  return res.data;
}

/** 更新成员（ADMIN） */
export async function updateOrganizationMember(
  userId: string,
  payload: UpdateMemberPayload
): Promise<OrganizationMember> {
  const res = await http.request<WmApiResponse<OrganizationMember>>(
    "patch",
    `/api/v1/platform/organization/members/${userId}`,
    { data: payload }
  );
  return res.data;
}
