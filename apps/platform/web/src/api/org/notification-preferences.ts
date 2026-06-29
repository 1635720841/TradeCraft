/**
 * 用户通知偏好 API（/api/v1/org/me/notification-preferences）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface NotificationPreference {
  emailEnabled: boolean;
  mutedTypes: string[];
}

export const NOTIFICATION_TYPE_OPTIONS = [
  { value: "brief_pending", label: "大纲待确认" },
  { value: "job_failed", label: "任务失败" },
  { value: "assigned", label: "任务被指派" },
  { value: "quota_low", label: "配额告警" },
  { value: "brief_escalation", label: "大纲超时提醒" },
  { value: "comment", label: "任务评论" },
  { value: "access_request", label: "项目访问申请" }
] as const;

export async function getNotificationPreferences(): Promise<NotificationPreference> {
  const res = await http.request<WmApiResponse<NotificationPreference>>(
    "get",
    "/api/v1/org/me/notification-preferences"
  );
  return res.data ?? { emailEnabled: true, mutedTypes: [] };
}

export async function updateNotificationPreferences(
  payload: Partial<NotificationPreference>
): Promise<NotificationPreference> {
  const res = await http.request<WmApiResponse<NotificationPreference>>(
    "patch",
    "/api/v1/org/me/notification-preferences",
    { data: payload }
  );
  return res.data;
}
