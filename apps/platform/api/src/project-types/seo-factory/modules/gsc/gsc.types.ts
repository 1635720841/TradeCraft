/**
 * GSC 模块共享类型定义。
 */

import type { GscQueryMetricRow } from './gsc-keyword-match.util';

export interface GscJobPagePerformance {
  impressions: number;
  clicks: number;
  position: number;
  periodDays: number;
  syncedAt: string;
}

export type { PlatformGscStatus, ConsoleGscSiteRow } from '@wm/platform-sdk';

export interface GscProjectQueryRow extends GscQueryMetricRow {
  siteDomain: string;
  periodDays: number;
  syncedAt: string;
}

export interface GscDiscoveredQuery {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  siteId: string;
  siteDomain: string;
}

export interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webAppOrigin: string;
}

export const PLATFORM_GSC_CREDENTIAL_ID = 'default';
export const GSC_PROPERTY_COUNT_CACHE_MS = 5 * 60 * 1000;
export const GSC_AUTO_CONNECT_BATCH_SIZE = 50;

export function isSiteGscConnected(
  connection:
    | {
        propertyUrl?: string | null;
        managedByPlatform?: boolean;
      }
    | null
    | undefined,
): boolean {
  return Boolean(connection?.propertyUrl && connection.managedByPlatform);
}
