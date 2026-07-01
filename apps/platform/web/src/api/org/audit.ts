/**
 * 企业操作审计 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "@/api/platform/types";
import type { AuditLogItem } from "@/api/console/types";

export interface OrgAuditLogListResult {
  items: AuditLogItem[];
  pagination: WmPaginationMeta;
}

export async function listOrgAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  actorKeyword?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<OrgAuditLogListResult> {
  const res = await http.request<WmApiResponse<AuditLogItem[]>>("get", "/api/v1/org/audit-logs", {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 50,
      action: params?.action,
      actorKeyword: params?.actorKeyword,
      dateFrom: params?.dateFrom,
      dateTo: params?.dateTo
    }
  });
  return {
    items: res.data ?? [],
    pagination: res.meta?.pagination ?? { page: 1, limit: 50, total: 0 }
  };
}
