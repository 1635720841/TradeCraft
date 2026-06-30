/**
 * 企业操作审计 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface OrgAuditLogRow {
  id: string;
  action: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export async function listOrgAuditLogs(params?: { page?: number; limit?: number }) {
  const res = await http.request<WmApiResponse<OrgAuditLogRow[]>>("get", "/api/v1/org/audit-logs", {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 50
    }
  });
  return res.data ?? [];
}
