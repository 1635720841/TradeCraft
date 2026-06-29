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
  { value: "article.brief_pending", label: "大纲待确认" },
  { value: "article.assigned", label: "任务被指派" },
  { value: "article.comment_added", label: "任务新评论" },
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

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export async function listWebhookDeliveries(
  webhookId: string,
  page = 1,
  limit = 20
): Promise<{ items: WebhookDeliveryLog[]; total: number; page: number; limit: number }> {
  const res = await http.request<
    WmApiResponse<WebhookDeliveryLog[]> & {
      meta?: { pagination?: { page: number; limit: number; total: number } };
    }
  >("get", `/api/v1/org/webhooks/${webhookId}/deliveries`, {
    params: { page, limit }
  });
  const pagination = res.meta?.pagination;
  return {
    items: res.data ?? [],
    total: pagination?.total ?? 0,
    page: pagination?.page ?? page,
    limit: pagination?.limit ?? limit
  };
}
