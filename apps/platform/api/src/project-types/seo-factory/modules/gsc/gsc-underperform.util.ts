/** GSC 搜索表现偏弱判定（可测纯函数） */

import type { GscTopPageRow } from './gsc.constants';

export const GSC_UNDERPERFORM_MIN_IMPRESSIONS = 50;
export const GSC_UNDERPERFORM_MAX_CTR = 0.01;
export const GSC_UNDERPERFORM_MAX_POSITION = 20;
export const GSC_UNDERPERFORM_JOB_LIMIT = 3;

export interface GscUnderperformingJob {
  jobId: string;
  keyword: string;
  page: string;
  impressions: number;
  clicks: number;
  position: number;
}

export function isGscPageUnderperforming(row: Pick<GscTopPageRow, 'impressions' | 'clicks' | 'ctr' | 'position'>): boolean {
  if (row.impressions < GSC_UNDERPERFORM_MIN_IMPRESSIONS) return false;
  if (row.clicks === 0) return true;
  if (row.ctr < GSC_UNDERPERFORM_MAX_CTR) return true;
  if (row.position > GSC_UNDERPERFORM_MAX_POSITION) return true;
  return false;
}

export function pickUnderperformingJobs(
  pages: GscTopPageRow[],
  limit = GSC_UNDERPERFORM_JOB_LIMIT,
): GscUnderperformingJob[] {
  const rows = pages
    .filter((row) => row.matchedJobId && isGscPageUnderperforming(row))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);

  return rows.map((row) => ({
    jobId: row.matchedJobId!,
    keyword: row.matchedKeyword?.trim() || '未命名',
    page: row.page,
    impressions: row.impressions,
    clicks: row.clicks,
    position: row.position,
  }));
}
