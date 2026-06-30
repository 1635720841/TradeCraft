/**
 * Console 租户管理 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type {
  CreateTenantPayload,
  CreateTenantResult,
  TenantDetail,
  TenantItem,
  TenantListResult,
  UpdateTenantPayload
} from "./types";

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

export async function createTenant(payload: CreateTenantPayload): Promise<CreateTenantResult> {
  const res = await http.request<WmApiResponse<CreateTenantResult>>(
    "post",
    "/api/v1/console/tenants",
    { data: payload }
  );
  return res.data;
}

export async function getTenant(organizationId: string): Promise<TenantDetail> {
  const res = await http.request<WmApiResponse<TenantDetail>>(
    "get",
    `/api/v1/console/tenants/${organizationId}`
  );
  return res.data;
}

export async function updateTenant(
  organizationId: string,
  payload: UpdateTenantPayload
): Promise<TenantDetail> {
  const res = await http.request<WmApiResponse<TenantDetail>>(
    "patch",
    `/api/v1/console/tenants/${organizationId}`,
    { data: payload }
  );
  return res.data;
}

export async function renewTenant(organizationId: string): Promise<TenantDetail> {
  const res = await http.request<WmApiResponse<TenantDetail>>(
    "post",
    `/api/v1/console/tenants/${organizationId}/renew`
  );
  return res.data;
}

export async function addTenantQuotaTopUp(
  organizationId: string,
  amount: number,
  note?: string
): Promise<TenantDetail> {
  const res = await http.request<WmApiResponse<TenantDetail>>(
    "post",
    `/api/v1/console/tenants/${organizationId}/quota-topup`,
    { data: { amount, note } }
  );
  return res.data;
}
