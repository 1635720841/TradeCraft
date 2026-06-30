/**
 * GSC 共享常量（前后端一致）。
 */

/** 超过该天数未同步则在运营页提示「数据可能过期」 */
export const GSC_STALE_SYNC_DAYS = 7;

export function isGscSyncStale(lastSyncAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastSyncAt) return false;
  const synced = Date.parse(lastSyncAt);
  if (Number.isNaN(synced)) return false;
  return nowMs - synced > GSC_STALE_SYNC_DAYS * 24 * 60 * 60 * 1000;
}
