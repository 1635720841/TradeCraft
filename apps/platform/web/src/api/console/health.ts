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

export interface ConsoleQueueJobItem {
  bullJobId: string;
  queue: string;
  queueLabel: string;
  state: string;
  position: number | null;
  enqueuedAt: string | null;
  jobId?: string;
  jobName?: string;
  traceId: string;
  organizationId: string;
  organizationName: string | null;
  projectId?: string;
  targetKeyword: string | null;
  articleStatus: string | null;
  workflowPhase: string | null;
  resumeFrom: string | null;
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

export async function getConsoleQueueJobs(options?: {
  state?: "waiting" | "active" | "delayed" | "failed" | "all";
  queue?: string;
  limit?: number;
}): Promise<{ items: ConsoleQueueJobItem[]; total: number; truncated?: boolean }> {
  const params: Record<string, string | number> = {};
  if (options?.state) params.state = options.state;
  if (options?.queue) params.queue = options.queue;
  if (options?.limit) params.limit = options.limit;
  const res = await http.request<
    WmApiResponse<{ items: ConsoleQueueJobItem[]; total: number }>
  >("get", "/api/v1/console/health/queue-jobs", { params });
  return res.data;
}
