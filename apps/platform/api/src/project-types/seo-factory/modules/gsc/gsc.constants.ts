/** Google Search Console OAuth 与 API 常量 */



export const GSC_OAUTH_SCOPES = [

  'https://www.googleapis.com/auth/webmasters.readonly',

];



export const GSC_SYNC_DAYS = 28;



export const GSC_TOP_ROW_LIMIT = 20;



/** 超过该天数未同步则在运营页提示「数据可能过期」 */

export const GSC_STALE_SYNC_DAYS = 7;



export interface GscTopPageRow {

  page: string;

  clicks: number;

  impressions: number;

  ctr: number;

  position: number;

  matchedJobId?: string | null;

  matchedKeyword?: string | null;

}



export interface GscSummaryData {

  periodDays: number;

  syncedAt: string;

  totals: {

    clicks: number;

    impressions: number;

    ctr: number;

    position: number;

  };

  topPages: GscTopPageRow[];

  topQueries: Array<{

    query: string;

    clicks: number;

    impressions: number;

    ctr: number;

    position: number;

  }>;

}



export interface GscOAuthStatePayload {

  siteId: string;

  organizationId: string;

  projectId: string;

  exp: number;

}



export function parseGscSummaryData(raw: unknown): GscSummaryData | null {

  if (!raw || typeof raw !== 'object') return null;

  const record = raw as GscSummaryData;

  if (!record.topPages || !record.topQueries || !record.totals) return null;

  return record;

}

