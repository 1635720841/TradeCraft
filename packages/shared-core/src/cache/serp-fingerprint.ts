/**
 * SERP 查询指纹：相同 keyword + locale + country 生成稳定缓存 key 后缀。
 *
 * 边界：
 * - 不负责：Redis 读写（由 Provider 层处理）
 */

/** 生成 SERP 缓存指纹（含抓取条数，避免不同 num 共用缓存） */
export function buildSerpFingerprint(
  keyword: string,
  locale: string,
  country: string,
  num?: number,
): string {
  const base = [
    keyword.trim().toLowerCase(),
    locale.trim().toLowerCase(),
    country.trim().toUpperCase(),
  ].join(':');
  if (num == null || !Number.isFinite(num)) {
    return base;
  }
  return `${base}:n${Math.trunc(num)}`;
}

/** Redis 缓存 key：serp:{orgId}:{projectId}:{fingerprint} */
export function buildSerpCacheKey(
  organizationId: string,
  projectId: string,
  fingerprint: string,
): string {
  return `serp:${organizationId}:${projectId}:${fingerprint}`;
}
