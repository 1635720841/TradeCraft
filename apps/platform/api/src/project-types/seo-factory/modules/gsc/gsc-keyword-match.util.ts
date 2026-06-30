/** GSC 搜索词与词库关键词匹配、搜索验证状态（可测纯函数） */

import { isGscPageUnderperforming } from './gsc-underperform.util';

export const GSC_DISCOVERED_QUERY_MIN_IMPRESSIONS = 20;
export const GSC_DISCOVERED_QUERY_LIMIT = 5;

export type GscKeywordInsightStatus = 'traffic' | 'impressions' | 'underperform' | 'none';

export interface GscQueryMetricRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  siteId?: string;
}

export interface GscKeywordInsight {
  status: GscKeywordInsightStatus;
  impressions: number;
  clicks: number;
  position: number;
  periodDays: number;
  syncedAt: string;
}

export function normalizeKeywordForGscMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchGscQueryToKeyword(
  keyword: string,
  queries: GscQueryMetricRow[],
  keywordSiteId?: string | null,
): (GscQueryMetricRow & { periodDays?: number; syncedAt?: string }) | null {
  const normalized = normalizeKeywordForGscMatch(keyword);
  if (!normalized) return null;

  const candidates = queries.filter((row) => {
    if (normalizeKeywordForGscMatch(row.query) !== normalized) return false;
    if (keywordSiteId && row.siteId && row.siteId !== keywordSiteId) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.impressions - a.impressions)[0];
}

export function resolveGscKeywordInsightStatus(
  row: Pick<GscQueryMetricRow, 'impressions' | 'clicks' | 'ctr' | 'position'>,
  keywordStatus: string,
): GscKeywordInsightStatus {
  if (row.impressions <= 0) return 'none';
  if (row.clicks > 0) {
    if (keywordStatus === 'USED' && isGscPageUnderperforming(row)) {
      return 'underperform';
    }
    return 'traffic';
  }
  if (isGscPageUnderperforming(row)) {
    return keywordStatus === 'USED' ? 'underperform' : 'impressions';
  }
  return 'impressions';
}

export function buildGscKeywordInsight(
  row: GscQueryMetricRow & { periodDays: number; syncedAt: string },
  keywordStatus: string,
): GscKeywordInsight {
  return {
    status: resolveGscKeywordInsightStatus(row, keywordStatus),
    impressions: row.impressions,
    clicks: row.clicks,
    position: row.position,
    periodDays: row.periodDays,
    syncedAt: row.syncedAt,
  };
}

export function pickDiscoveredGscQueries(
  queries: Array<GscQueryMetricRow & { siteDomain?: string }>,
  existingKeywords: string[],
  limit = GSC_DISCOVERED_QUERY_LIMIT,
): GscQueryMetricRow[] {
  const existing = new Set(existingKeywords.map((k) => normalizeKeywordForGscMatch(k)));

  return queries
    .filter(
      (row) =>
        row.impressions >= GSC_DISCOVERED_QUERY_MIN_IMPRESSIONS &&
        !existing.has(normalizeKeywordForGscMatch(row.query)),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}
