/**
 * Console 健康检查 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface QueueHealthItem {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface ProviderHealthItem {
  name: string;
  configured?: boolean;
  mode?: string;
}

export async function getConsoleQueueHealth(): Promise<{ queues: QueueHealthItem[] }> {
  const res = await http.request<WmApiResponse<{ queues: QueueHealthItem[] }>>(
    "get",
    "/api/v1/console/health/queues"
  );
  return res.data;
}

export async function getConsoleProviderHealth(): Promise<{
  providers: ProviderHealthItem[];
}> {
  const res = await http.request<WmApiResponse<{ providers: ProviderHealthItem[] }>>(
    "get",
    "/api/v1/console/health/providers"
  );
  return res.data;
}
