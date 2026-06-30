/**
 * Console 概览与计费申请 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type { BillingChangeRequestItem, ConsoleOverview, ImpersonateResult } from "./types";

export async function getConsoleOverview(): Promise<ConsoleOverview> {
  const res = await http.request<WmApiResponse<ConsoleOverview>>(
    "get",
    "/api/v1/console/overview"
  );
  return res.data;
}

export async function listConsoleBillingRequests(): Promise<BillingChangeRequestItem[]> {
  const res = await http.request<WmApiResponse<BillingChangeRequestItem[]>>(
    "get",
    "/api/v1/console/billing-requests"
  );
  return res.data ?? [];
}

export async function approveConsoleBillingRequest(requestId: string): Promise<void> {
  await http.request("post", `/api/v1/console/billing-requests/${requestId}/approve`);
}

export async function rejectConsoleBillingRequest(requestId: string): Promise<void> {
  await http.request("post", `/api/v1/console/billing-requests/${requestId}/reject`);
}

export async function impersonateUser(
  userId: string,
  reason: string
): Promise<ImpersonateResult> {
  const res = await http.request<WmApiResponse<ImpersonateResult>>(
    "post",
    "/api/v1/console/impersonate",
    { data: { userId, reason } }
  );
  return res.data;
}
