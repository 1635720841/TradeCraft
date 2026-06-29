import type { SiteContentProfile, SiteItem } from "@/api/seo-factory/types";

/** 与后端 siteHasWritingProfile 一致：行业 +（产品线 或 至少 1 条卖点） */
export function siteHasMinWritingProfile(profile?: SiteContentProfile | null): boolean {
  if (!profile?.industry?.trim()) return false;
  const hasProductLines = Boolean(profile.productLines?.trim());
  const hasDifferentiator = (profile.differentiators?.length ?? 0) >= 1;
  return hasProductLines || hasDifferentiator;
}

export function siteItemHasMinWritingProfile(site: SiteItem): boolean {
  return siteHasMinWritingProfile(site.contentProfile);
}
