import { dictLabel } from "@/utils/dict";
import {
  SERP_COUNTRY_OPTIONS,
  TARGET_MARKET_OPTIONS,
  type SerpCountryCode
} from "@/constants/dicts/seo-factory";
import type { SiteItem } from "@/api/seo-factory/types";

const MARKET_SEP = /[,，]/;

const TARGET_MARKET_TO_SERP: Record<string, SerpCountryCode[]> = {
  US: ["US"],
  CA: ["CA"],
  UK: ["GB"],
  EU: ["DE", "FR"],
  DE: ["DE"],
  AU: ["AU"],
  SEA: ["SG", "VN"],
  JP: ["JP"],
  IN: ["IN"]
};

const SERP_COUNTRY_SET = new Set<string>(SERP_COUNTRY_OPTIONS.map((item) => item.value));

function isSerpCountryCode(value: string): value is SerpCountryCode {
  return SERP_COUNTRY_SET.has(value.toUpperCase());
}

/** 解析站点目标市场（兼容 API 数组与 DB 逗号分隔字符串） */
export function parseTargetMarkets(
  value?: string[] | string | null
): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (!value?.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(MARKET_SEP)) {
    const item = part.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

/** 列表/摘要展示：美国 (US)、欧洲 (EU) */
export function formatTargetMarketsLabel(
  value?: string[] | string | null,
  fallback = "-"
): string {
  const markets = parseTargetMarkets(value);
  if (!markets.length) return fallback;
  return markets
    .map((code) => dictLabel(TARGET_MARKET_OPTIONS, code, code))
    .join("、");
}

/** 站点目标市场 → 本篇可选 SERP 国家 */
export function resolveSerpCountriesFromTargetMarkets(
  value?: string[] | string | null
): SerpCountryCode[] {
  const seen = new Set<string>();
  const result: SerpCountryCode[] = [];
  const push = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!isSerpCountryCode(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  for (const market of parseTargetMarkets(value)) {
    const mapped = TARGET_MARKET_TO_SERP[market] ?? TARGET_MARKET_TO_SERP[market.toUpperCase()];
    if (mapped?.length) {
      for (const code of mapped) push(code);
      continue;
    }
    push(market);
  }
  return result;
}

export function resolveJobSerpCountryPicker(site?: SiteItem | null) {
  const fromTargets = resolveSerpCountriesFromTargetMarkets(
    site?.targetMarkets ?? site?.targetMarket
  );
  const options =
    fromTargets.length > 0
      ? fromTargets.map((value) => ({
          value,
          label: dictLabel(SERP_COUNTRY_OPTIONS, value, value)
        }))
      : SERP_COUNTRY_OPTIONS.map((item) => ({ value: item.value, label: item.label }));

  const defaultCountry = options[0]?.value ?? "US";

  return {
    options,
    defaultCountry,
    showPicker: fromTargets.length > 1,
    siteMarketsLabel: formatTargetMarketsLabel(site?.targetMarkets ?? site?.targetMarket, "")
  };
}

export function formatSerpCountryLabel(code?: string | null) {
  return dictLabel(SERP_COUNTRY_OPTIONS, code, code || "-");
}
