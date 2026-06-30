/**
 * 页面库同步辅助纯函数（业务权重与 sitemap priority 合并）。
 */

/** 页面类型基础权重 + sitemap priority 取较高值 */
export function resolveSitePageBusinessValue(
  pageType: string,
  sitemapPriority: number | null | undefined,
): number {
  const normalized = pageType.toUpperCase();
  const typeBase =
    normalized === 'PRODUCT' || normalized === 'SERVICE' ? 0.85 : 0.65;

  if (sitemapPriority == null || !Number.isFinite(sitemapPriority)) {
    return typeBase;
  }

  const clamped = Math.min(1, Math.max(0, sitemapPriority));
  return Math.max(typeBase, clamped);
}
