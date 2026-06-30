/**
 * seo-factory Google Search Console API。
 */

import { GSC_STALE_SYNC_DAYS, isGscSyncStale as sharedIsGscSyncStale } from "@wm/shared-core";
import { http } from "@/utils/http";
import { seoFactoryApiPath } from "./paths";
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
    seoFactoryApiPath(projectId, `sites/${siteId}/gsc`)
  );
  return res.data;
}

export async function syncSiteGsc(
  projectId: string,
  siteId: string
): Promise<{ summary: GscSummaryData }> {
  const res = await http.request<WmApiResponse<{ summary: GscSummaryData }>>(
    "post",
    seoFactoryApiPath(projectId, `sites/${siteId}/gsc/sync`)
  );
  return res.data;
}

export async function getProjectGscOverview(
  projectId: string
): Promise<ProjectGscSiteOverview[]> {
  const res = await http.request<WmApiResponse<ProjectGscSiteOverview[]>>(
    "get",
    seoFactoryApiPath(projectId, "gsc/overview")
  );
  return res.data ?? [];
}

export function formatGscPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatGscPosition(value: number): string {
  return value > 0 ? value.toFixed(1) : "-";
}

export function isGscSyncStale(lastSyncAt?: string | null): boolean {
  return sharedIsGscSyncStale(lastSyncAt);
}

export { GSC_STALE_SYNC_DAYS };
