/**
 * QuillBot 润色保护词提取：Brief、Semrush、站点 B2B Profile、正文规格。
 *
 * 边界：
 * - 不负责：LLM 调用（ParaphraseService）
 */

import { parseSiteSettings } from '../../constants/site-settings';

const TERM_SPLIT = /[,，;/|]+/;
const MODEL_PATTERN = /\b[A-Z]{1,5}[-_]?\d{2,}[A-Z0-9-]*\b/g;
const SPEC_PATTERN =
  /\d+(?:\.\d+)?\s*(?:mm|cm|m|kg|g|lb|lbs|bar|psi|kPa|MPa|V|A|W|kW|Hz|°C|℃|%|inch|in|ft)\b/gi;
const TRADE_TERMS = [
  'FOB',
  'CIF',
  'CFR',
  'EXW',
  'DDP',
  'MOQ',
  'OEM',
  'ODM',
  'CE',
  'UL',
  'ISO',
  'RoHS',
  'REACH',
  'FDA',
  'ANSI',
  'ASTM',
  'DIN',
];

export interface BuildParaphraseProtectedTermsInput {
  briefData: unknown;
  seoCheckData: unknown;
  siteSettings: unknown;
  originalContent: string;
  targetKeyword: string;
}

function splitTerms(value: string): string[] {
  return value
    .split(TERM_SPLIT)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function pushStrings(target: string[], items: unknown): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      target.push(item.trim());
    }
  }
}

function collectFromBrief(briefData: unknown): string[] {
  const terms: string[] = [];
  const root = briefData as { recommendedEntities?: string[]; outline?: Record<string, unknown> } | null;
  pushStrings(terms, root?.recommendedEntities);

  const outline = root?.outline ?? {};
  for (const key of ['recommendedKeywords', 'secondaryKeywords', 'semanticKeywords']) {
    pushStrings(terms, outline[key]);
  }

  return terms;
}

function collectFromSeoCheck(seoCheckData: unknown): string[] {
  const check = (seoCheckData ?? {}) as Record<string, unknown>;
  const terms: string[] = [];
  const semrush = check.semrush as { submittedKeywords?: string[] } | undefined;
  const local = check.local as { recommendedKeywords?: string[] } | undefined;
  pushStrings(terms, semrush?.submittedKeywords);
  pushStrings(terms, local?.recommendedKeywords);
  return terms;
}

function collectFromSite(siteSettings: unknown): string[] {
  const profile = parseSiteSettings(siteSettings).contentProfile;
  const terms: string[] = [];
  if (profile?.certifications) terms.push(...splitTerms(profile.certifications));
  if (profile?.productLines) terms.push(...splitTerms(profile.productLines));
  if (profile?.moqLeadTime) terms.push(...splitTerms(profile.moqLeadTime));
  return terms;
}

function collectFromContent(content: string): string[] {
  const terms: string[] = [];
  terms.push(...(content.match(MODEL_PATTERN) ?? []));
  terms.push(...(content.match(SPEC_PATTERN) ?? []).map((item) => item.replace(/\s+/g, ' ').trim()));

  for (const term of TRADE_TERMS) {
    if (new RegExp(`\\b${term}\\b`, 'i').test(content)) {
      terms.push(term);
    }
  }

  return terms;
}

/** 合并去重保护词，排除主关键词本身 */
export function buildParaphraseProtectedTerms(input: BuildParaphraseProtectedTermsInput): string[] {
  const main = input.targetKeyword.trim().toLowerCase();
  const merged = [
    ...collectFromBrief(input.briefData),
    ...collectFromSeoCheck(input.seoCheckData),
    ...collectFromSite(input.siteSettings),
    ...collectFromContent(input.originalContent),
  ];

  const unique = new Map<string, string>();
  for (const item of merged) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (trimmed.toLowerCase() === main) continue;
    const key = trimmed.toLowerCase();
    if (!unique.has(key)) unique.set(key, trimmed);
  }

  return [...unique.values()].slice(0, 80);
}
