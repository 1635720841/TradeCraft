/** 站点 settings JSON：工作流开关 + B2B 内容 Profile / CTA */

import type { SiteWorkflowSettings } from './brief-approval';
import { parseSiteWorkflowSettings } from './brief-approval';
import {
  parseSiteSerpResearchSettings,
  type SiteSerpResearchSettings,
} from './serp-research-settings';

export type { SiteSerpResearchSettings };

export interface SiteContentProfile {
  industry?: string;
  certifications?: string;
  moqLeadTime?: string;
  ctaPrimaryText?: string;
  ctaPrimaryUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  productLines?: string;
  differentiators?: string[];
  targetBuyerType?: string;
  forbiddenTerms?: string[];
  caseHighlights?: string;
}

export interface SiteSettings extends SiteWorkflowSettings {
  ownerUserId?: string;
  contentProfile?: SiteContentProfile;
  serpResearch?: SiteSerpResearchSettings;
}

const STRING_PROFILE_KEYS = [
  'industry',
  'certifications',
  'moqLeadTime',
  'ctaPrimaryText',
  'ctaPrimaryUrl',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'productLines',
  'targetBuyerType',
  'caseHighlights',
] as const;

const ARRAY_PROFILE_KEYS = ['differentiators', 'forbiddenTerms'] as const;

function parseStringArray(value: unknown, maxItems: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

export function parseSiteContentProfile(raw: unknown): SiteContentProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const record = raw as Record<string, unknown>;
  const profile: SiteContentProfile = {};

  for (const key of STRING_PROFILE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      profile[key] = value.trim();
    }
  }

  const differentiators = parseStringArray(record.differentiators, 3);
  if (differentiators) profile.differentiators = differentiators;

  const forbiddenTerms = parseStringArray(record.forbiddenTerms, 10);
  if (forbiddenTerms) profile.forbiddenTerms = forbiddenTerms;

  return Object.keys(profile).length > 0 ? profile : undefined;
}

/** 站点是否已填写最少写作素材（行业 + 至少 1 条卖点） */
export function siteHasWritingProfile(settings: unknown): boolean {
  const profile = parseSiteSettings(settings).contentProfile;
  if (!profile?.industry?.trim()) {
    return false;
  }
  const hasProductLines = Boolean(profile.productLines?.trim());
  const hasDifferentiator = (profile.differentiators?.length ?? 0) >= 1;
  return hasProductLines || hasDifferentiator;
}

export function parseSiteSettings(settings: unknown): SiteSettings {
  const raw = (settings ?? {}) as SiteSettings;
  const workflow = parseSiteWorkflowSettings(settings);
  const ownerUserId =
    typeof raw.ownerUserId === 'string' && raw.ownerUserId.trim()
      ? raw.ownerUserId.trim()
      : undefined;
  return {
    ...workflow,
    ownerUserId,
    contentProfile: parseSiteContentProfile(raw.contentProfile),
    serpResearch: parseSiteSerpResearchSettings(raw.serpResearch),
  };
}

export function formatSiteContentProfileForPrompt(profile?: SiteContentProfile): string {
  if (!profile) return '';

  const lines = ['## Site B2B Profile (use for CTAs and credibility)'];
  if (profile.industry) lines.push(`- Industry / niche: ${profile.industry}`);
  if (profile.productLines) lines.push(`- Product lines / applications: ${profile.productLines}`);
  if (profile.differentiators?.length) {
    lines.push(
      `- Key differentiators:\n${profile.differentiators.map((item, index) => `  ${index + 1}. ${item}`).join('\n')}`,
    );
  }
  if (profile.targetBuyerType) lines.push(`- Target buyer type: ${profile.targetBuyerType}`);
  if (profile.certifications) lines.push(`- Certifications / compliance: ${profile.certifications}`);
  if (profile.moqLeadTime) lines.push(`- MOQ / lead time notes: ${profile.moqLeadTime}`);
  if (profile.caseHighlights) lines.push(`- Case highlights / customer types: ${profile.caseHighlights}`);
  if (profile.ctaPrimaryText) {
    const url = profile.ctaPrimaryUrl ? ` → ${profile.ctaPrimaryUrl}` : '';
    lines.push(`- Primary CTA (prefer in closing section): ${profile.ctaPrimaryText}${url}`);
  }
  if (profile.utmSource || profile.utmMedium || profile.utmCampaign) {
    const utmParts = [
      profile.utmSource ? `source=${profile.utmSource}` : '',
      profile.utmMedium ? `medium=${profile.utmMedium}` : '',
      profile.utmCampaign ? `campaign=${profile.utmCampaign}` : '',
    ].filter(Boolean);
    lines.push(`- CTA UTM template: ${utmParts.join(', ')}`);
  }
  if (profile.forbiddenTerms?.length) {
    lines.push(`- Forbidden terms (NEVER use in copy): ${profile.forbiddenTerms.join(', ')}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/** 将站点 Profile 追加到 brandVoice，供 Brief/Draft Prompt 使用 */
export function enrichBrandVoiceForPrompt(
  brandVoice: string | null | undefined,
  settings: unknown,
): string | undefined {
  const parts = [
    brandVoice?.trim(),
    formatSiteContentProfileForPrompt(parseSiteSettings(settings).contentProfile),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/** 合并 contentProfile patch（供 site.service 与测试复用） */
export function mergeSiteContentProfile(
  existing: SiteContentProfile | undefined,
  patch: SiteContentProfile | undefined,
): SiteContentProfile | undefined {
  if (!patch) return existing;

  const merged: SiteContentProfile = { ...(existing ?? {}) };

  for (const key of STRING_PROFILE_KEYS) {
    if (patch[key] !== undefined) {
      const value = patch[key]?.trim();
      if (value) merged[key] = value;
      else delete merged[key];
    }
  }

  for (const key of ARRAY_PROFILE_KEYS) {
    if (patch[key] !== undefined) {
      const value = patch[key]?.map((item) => item.trim()).filter(Boolean);
      if (value && value.length > 0) merged[key] = value;
      else delete merged[key];
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}
