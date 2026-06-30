/**
 * 站点级页面库配置（存于 site.settings.pageLibrary）。
 */

import {
  DEFAULT_SITE_PAGE_LIBRARY_SYNC_LIMIT,
  MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT,
  MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT,
} from './serp-filter';

export interface SitePageLibrarySettings {
  /** 单次 Sitemap 同步最多写入条数 */
  syncLimit?: number;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function parseSitePageLibrarySettings(raw: unknown): SitePageLibrarySettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const record = raw as Record<string, unknown>;
  const parsed: SitePageLibrarySettings = {};

  if (record.syncLimit !== undefined) {
    parsed.syncLimit = clampInt(
      record.syncLimit,
      MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT,
      MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT,
      DEFAULT_SITE_PAGE_LIBRARY_SYNC_LIMIT,
    );
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function mergeSitePageLibrarySettings(
  existing: SitePageLibrarySettings | undefined,
  patch: SitePageLibrarySettings | undefined,
): SitePageLibrarySettings | undefined {
  if (!patch) return existing;

  const merged: SitePageLibrarySettings = { ...(existing ?? {}) };

  if (patch.syncLimit !== undefined) {
    merged.syncLimit = clampInt(
      patch.syncLimit,
      MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT,
      MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT,
      DEFAULT_SITE_PAGE_LIBRARY_SYNC_LIMIT,
    );
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** 解析站点页面库同步条数上限 */
export function resolveSitePageLibrarySyncLimit(settings: unknown): number {
  const parsed = parseSitePageLibrarySettings(
    (settings as { pageLibrary?: unknown } | null)?.pageLibrary,
  );
  return (
    parsed?.syncLimit ??
    clampInt(
      undefined,
      MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT,
      MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT,
      DEFAULT_SITE_PAGE_LIBRARY_SYNC_LIMIT,
    )
  );
}
