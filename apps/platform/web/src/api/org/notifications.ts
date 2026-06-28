/**
 * 站内通知 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export async function listNotifications(unreadOnly = false): Promise<{
  items: UserNotification[];
  unread: number;
}> {
  const res = await http.request<
    WmApiResponse<UserNotification[]> & { meta: { unread?: number } }
  >("get", "/api/v1/org/notifications", {
    params: { unreadOnly: unreadOnly ? "1" : undefined, limit: 30 }
  });
  return { items: res.data ?? [], unread: res.meta?.unread ?? 0 };
}

export async function markNotificationRead(id: string) {
  await http.request("patch", `/api/v1/org/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  await http.request("patch", "/api/v1/org/notifications/read-all");
}
