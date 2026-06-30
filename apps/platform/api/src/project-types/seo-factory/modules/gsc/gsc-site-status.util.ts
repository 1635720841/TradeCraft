/** 站点列表 Google 搜索状态（可测纯函数） */

import { isGscSyncStale } from '@wm/shared-core';

export type SiteGscListStatus =
  | 'not_enabled'
  | 'unbound'
  | 'pending_sync'
  | 'stale'
  | 'error'
  | 'synced';

export interface SiteGscConnectionSnapshot {
  propertyUrl?: string | null;
  managedByPlatform?: boolean;
  lastSyncAt?: Date | string | null;
  lastSyncError?: string | null;
}

export interface SiteGscListSummary {
  status: SiteGscListStatus;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

function isSiteGscConnected(connection: SiteGscConnectionSnapshot | null | undefined): boolean {
  return Boolean(connection?.propertyUrl && connection.managedByPlatform);
}

export function buildSiteGscListSummary(
  gscEnabled: boolean,
  connection: SiteGscConnectionSnapshot | null | undefined,
): SiteGscListSummary {
  if (!gscEnabled) {
    return { status: 'not_enabled', lastSyncAt: null, lastSyncError: null };
  }

  if (!isSiteGscConnected(connection)) {
    return { status: 'unbound', lastSyncAt: null, lastSyncError: null };
  }

  const lastSyncAt =
    connection?.lastSyncAt instanceof Date
      ? connection.lastSyncAt.toISOString()
      : connection?.lastSyncAt ?? null;
  const lastSyncError = connection?.lastSyncError?.trim() || null;

  if (lastSyncError) {
    return { status: 'error', lastSyncAt, lastSyncError };
  }

  if (!lastSyncAt) {
    return { status: 'pending_sync', lastSyncAt: null, lastSyncError: null };
  }

  if (isGscSyncStale(lastSyncAt)) {
    return { status: 'stale', lastSyncAt, lastSyncError: null };
  }

  return { status: 'synced', lastSyncAt, lastSyncError: null };
}
