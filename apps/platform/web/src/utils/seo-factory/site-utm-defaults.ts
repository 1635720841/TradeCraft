/** 站点转化追踪 UTM 默认值（与后端 site-utm-defaults.util 保持一致） */

export const DEFAULT_SITE_UTM_SOURCE = "seo-factory";
export const DEFAULT_SITE_UTM_MEDIUM = "blog";

export function domainToUtmCampaign(domain: string): string {
  let value = domain.trim().toLowerCase();
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/\/.*$/, "");
  value = value.replace(/\/+$/, "");
  value = value.replace(/^www\./, "");
  return value.replace(/\./g, "-");
}

export function resolveSiteUtmDefaults(domain: string): {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
} {
  return {
    utmSource: DEFAULT_SITE_UTM_SOURCE,
    utmMedium: DEFAULT_SITE_UTM_MEDIUM,
    utmCampaign: domainToUtmCampaign(domain)
  };
}
