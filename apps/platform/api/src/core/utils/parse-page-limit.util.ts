/**
 * 解析分页查询参数，避免 NaN 与越界。
 */

export interface PageLimitDefaults {
  page: number;
  limit: number;
}

export function parsePageLimit(
  page?: string,
  limit?: string,
  defaults: PageLimitDefaults = { page: 1, limit: 20 },
): { page: number; limit: number } {
  const p = Number(page);
  const l = Number(limit);
  return {
    page: Number.isFinite(p) && p >= 1 ? Math.floor(p) : defaults.page,
    limit: Number.isFinite(l) && l >= 1 ? Math.min(100, Math.floor(l)) : defaults.limit,
  };
}
