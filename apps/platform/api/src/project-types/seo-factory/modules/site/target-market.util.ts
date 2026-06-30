/**
 * 站点目标市场：DB 存逗号分隔字符串，API 层使用数组。
 *
 * 边界：
 * - 不负责：SERP 抓取国家（由站点目标市场 + 任务创建时选择）
 */

const MARKET_SEP = /[,，]/;

export function parseTargetMarkets(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(MARKET_SEP)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function serializeTargetMarkets(markets: string[] | null | undefined): string | null {
  if (!markets?.length) return null;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of markets) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized.length > 0 ? normalized.join(',') : null;
}

/** 供 LLM 提示词使用的市场描述（多市场以逗号连接） */
export function formatTargetMarketsForPrompt(raw: string | null | undefined): string | undefined {
  const markets = parseTargetMarkets(raw);
  if (!markets.length) return undefined;
  return markets.join(', ');
}

/** 工作流默认市场：取配置的第一项 */
export function primaryTargetMarket(raw: string | null | undefined, fallback = 'US'): string {
  return parseTargetMarkets(raw)[0] ?? fallback;
}

/** 站点目标市场 → 可抓 SERP 的国家代码（EU/SEA 等区域会展开） */
const TARGET_MARKET_TO_SERP: Record<string, string[]> = {
  US: ['US'],
  CA: ['CA'],
  UK: ['GB'],
  EU: ['DE', 'FR'],
  DE: ['DE'],
  AU: ['AU'],
  SEA: ['SG', 'VN'],
  JP: ['JP'],
  IN: ['IN'],
};

export function resolveSerpCountriesFromTargetMarkets(
  raw: string | null | undefined,
  isValidSerpCountry: (value: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !isValidSerpCountry(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  for (const market of parseTargetMarkets(raw)) {
    const mapped = TARGET_MARKET_TO_SERP[market] ?? TARGET_MARKET_TO_SERP[market.toUpperCase()];
    if (mapped?.length) {
      for (const code of mapped) push(code);
      continue;
    }
    push(market);
  }
  return result;
}

