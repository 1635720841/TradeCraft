/** 站点转化追踪 UTM 默认值 */

import type { SiteContentProfile } from './site-settings';

export const DEFAULT_SITE_UTM_SOURCE = 'seo-factory';
export const DEFAULT_SITE_UTM_MEDIUM = 'blog';

export function domainToUtmCampaign(domain: string): string {
  let value = domain.trim().toLowerCase();
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/\/.*$/, '');
  value = value.replace(/\/+$/, '');
  value = value.replace(/^www\./, '');
  return value.replace(/\./g, '-');
}

export function resolveSiteUtmDefaults(domain: string): {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
} {
  return {
    utmSource: DEFAULT_SITE_UTM_SOURCE,
    utmMedium: DEFAULT_SITE_UTM_MEDIUM,
    utmCampaign: domainToUtmCampaign(domain),
  };
}

export function withDefaultSiteUtmProfile(
  domain: string,
  profile?: SiteContentProfile,
): SiteContentProfile {
  const defaults = resolveSiteUtmDefaults(domain);
  return {
    ...(profile ?? {}),
    utmSource: profile?.utmSource?.trim() || defaults.utmSource,
    utmMedium: profile?.utmMedium?.trim() || defaults.utmMedium,
    utmCampaign: profile?.utmCampaign?.trim() || defaults.utmCampaign,
  };
}
