/**
 * Console GSC 集成管理 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import type { ConsoleSiteRowBase } from "./site-row";

export interface PlatformGscStatus {
  oauthConfigured: boolean;
  platformConnected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
  propertyCount: number | null;
}

export interface ConsoleGscSiteRow extends ConsoleSiteRowBase {
  connected: boolean;
  managedByPlatform: boolean;
  propertyUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export async function getConsoleGscStatus(): Promise<PlatformGscStatus> {
  const res = await http.request<WmApiResponse<PlatformGscStatus>>(
    "get",
    "/api/v1/console/gsc/status",
    { skipGlobalErrorToast: true }
  );
  return res.data;
}

export async function getConsoleGscConnectUrl(): Promise<{ authUrl: string }> {
  const res = await http.request<WmApiResponse<{ authUrl: string }>>(
    "get",
    "/api/v1/console/gsc/connect-url",
    { skipGlobalErrorToast: true }
  );
  return res.data;
}

export async function disconnectConsoleGsc(): Promise<{ disconnected: boolean }> {
  const res = await http.request<WmApiResponse<{ disconnected: boolean }>>(
    "post",
    "/api/v1/console/gsc/disconnect",
    { skipGlobalErrorToast: true }
  );
  return res.data;
}

export async function listConsoleGscSites(options?: {
  page?: number;
  limit?: number;
  keyword?: string;
  connected?: "true" | "false";
}): Promise<{ items: ConsoleGscSiteRow[]; page: number; limit: number; total: number }> {
  const params: Record<string, string | number> = {};
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;
  if (options?.keyword) params.keyword = options.keyword;
  if (options?.connected) params.connected = options.connected;

  const res = await http.request<WmApiResponse<ConsoleGscSiteRow[]>>(
    "get",
    "/api/v1/console/gsc/sites",
    { params, skipGlobalErrorToast: true }
  );
  const pagination = (res.meta as { pagination?: { page: number; limit: number; total: number } })
    ?.pagination;
  return {
    items: res.data,
    page: pagination?.page ?? 1,
    limit: pagination?.limit ?? 20,
    total: pagination?.total ?? res.data.length
  };
}

export async function autoConnectAllConsoleGscSites(): Promise<{
  connected: number;
  failed: number;
  skipped: number;
  total: number;
}> {
  const res = await http.request<
    WmApiResponse<{ connected: number; failed: number; skipped: number; total: number }>
  >("post", "/api/v1/console/gsc/auto-connect-all", { skipGlobalErrorToast: true });
  return res.data;
}

export async function connectConsoleGscSite(siteId: string): Promise<{
  connected: boolean;
  reason?: string;
}> {
  const res = await http.request<WmApiResponse<{ connected: boolean; reason?: string }>>(
    "post",
    `/api/v1/console/gsc/sites/${siteId}/connect`,
    { skipGlobalErrorToast: true }
  );
  return res.data;
}

export async function disconnectConsoleGscSite(siteId: string): Promise<{ disconnected: boolean }> {
  const res = await http.request<WmApiResponse<{ disconnected: boolean }>>(
    "post",
    `/api/v1/console/gsc/sites/${siteId}/disconnect`,
    { skipGlobalErrorToast: true }
  );
  return res.data;
}

export async function syncConsoleGscSite(siteId: string): Promise<{ summary: unknown }> {
  const res = await http.request<WmApiResponse<{ summary: unknown }>>(
    "post",
    `/api/v1/console/gsc/sites/${siteId}/sync`,
    { skipGlobalErrorToast: true }
  );
  return res.data;
}
