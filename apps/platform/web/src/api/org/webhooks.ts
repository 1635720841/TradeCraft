/**
 * 企业 Webhook 集成 API（/api/v1/org/webhooks）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface OrgWebhookItem {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  createdAt: string;
  updatedAt?: string;
}

export const WEBHOOK_EVENT_OPTIONS = [
  { value: "article.completed", label: "文章任务完成" },
  { value: "article.failed", label: "文章任务失败" },
  { value: "org.quota_low", label: "配额告警" }
] as const;

export async function listOrgWebhooks(): Promise<OrgWebhookItem[]> {
  const res = await http.request<WmApiResponse<OrgWebhookItem[]>>(
    "get",
    "/api/v1/org/webhooks"
  );
  return res.data ?? [];
}

export async function createOrgWebhook(payload: {
  url: string;
  events: string[];
}): Promise<OrgWebhookItem> {
  const res = await http.request<WmApiResponse<OrgWebhookItem>>(
    "post",
    "/api/v1/org/webhooks",
    { data: payload }
  );
  return res.data;
}

export async function updateOrgWebhook(
  id: string,
  payload: { url?: string; events?: string[]; isActive?: boolean }
): Promise<OrgWebhookItem> {
  const res = await http.request<WmApiResponse<OrgWebhookItem>>(
    "patch",
    `/api/v1/org/webhooks/${id}`,
    { data: payload }
  );
  return res.data;
}

export async function deleteOrgWebhook(id: string): Promise<void> {
  await http.request("delete", `/api/v1/org/webhooks/${id}`);
}
