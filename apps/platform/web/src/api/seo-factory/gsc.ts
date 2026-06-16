/**
 * seo-factory Google Search Console API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "./types";

export interface GscSummaryTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSummaryRow {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscTopPageRow extends GscSummaryRow {
  page: string;
  matchedJobId?: string | null;
  matchedKeyword?: string | null;
}

export interface GscSummaryData {
  periodDays: number;
  syncedAt: string;
  totals: GscSummaryTotals;
  topPages: GscTopPageRow[];
  topQueries: Array<GscSummaryRow & { query: string }>;
}

export interface SiteGscStatus {
  configured: boolean;
  connected: boolean;
  propertyUrl?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  summary?: GscSummaryData | null;
}

export interface ProjectGscSiteOverview {
  siteId: string;
  domain: string;
  connected: boolean;
  propertyUrl?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  summary?: GscSummaryData | null;
}

export async function getSiteGscStatus(
  projectId: string,
  siteId: string
): Promise<SiteGscStatus> {
  const res = await http.request<WmApiResponse<SiteGscStatus>>(
    "get",
    `/api/v1/projects/${projectId}/sites/${siteId}/gsc`
  );
  return res.data;
}

export async function getGscConnectUrl(
  projectId: string,
  siteId: string
): Promise<{ authUrl: string }> {
  const res = await http.request<WmApiResponse<{ authUrl: string }>>(
    "get",
    `/api/v1/projects/${projectId}/sites/${siteId}/gsc/connect-url`
  );
  return res.data;
}

export async function syncSiteGsc(
  projectId: string,
  siteId: string
): Promise<{ summary: GscSummaryData }> {
  const res = await http.request<WmApiResponse<{ summary: GscSummaryData }>>(
    "post",
    `/api/v1/projects/${projectId}/sites/${siteId}/gsc/sync`
  );
  return res.data;
}

export async function disconnectSiteGsc(
  projectId: string,
  siteId: string
): Promise<void> {
  await http.request(
    "post",
    `/api/v1/projects/${projectId}/sites/${siteId}/gsc/disconnect`
  );
}

export async function getProjectGscOverview(
  projectId: string
): Promise<ProjectGscSiteOverview[]> {
  const res = await http.request<WmApiResponse<ProjectGscSiteOverview[]>>(
    "get",
    `/api/v1/projects/${projectId}/gsc/overview`
  );
  return res.data ?? [];
}

export function formatGscPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatGscPosition(value: number): string {
  return value > 0 ? value.toFixed(1) : "-";
}

const GSC_STALE_SYNC_DAYS = 7;

export function isGscSyncStale(lastSyncAt?: string | null): boolean {
  if (!lastSyncAt) return false;
  const synced = Date.parse(lastSyncAt);
  if (Number.isNaN(synced)) return false;
  const ageMs = Date.now() - synced;
  return ageMs > GSC_STALE_SYNC_DAYS * 24 * 60 * 60 * 1000;
}
