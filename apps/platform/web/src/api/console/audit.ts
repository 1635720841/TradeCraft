/**
 * Console 审计日志 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type { AuditLogItem, AuditLogListResult } from "./types";

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
