/**
 * 站点级搜索结果 / 竞品分析策略（存于 site.settings.serpResearch）。
 */

import {
  DEFAULT_SERP_ARTICLE_LIMIT,
  MAX_SERP_ARTICLE_LIMIT,
  MIN_SERP_ARTICLE_CANDIDATES,
  SERPER_ORGANIC_NUM,
  MAX_SERPER_ORGANIC_NUM,
  MIN_SERPER_ORGANIC_NUM,
  DEFAULT_SERP_CACHE_TTL_HOURS,
  MAX_SERP_CACHE_TTL_HOURS,
  MIN_SERP_CACHE_TTL_HOURS,
} from './serp-filter';
import { resolveSerpCountriesFromTargetMarkets } from '../modules/site/target-market.util';

export interface SiteSerpResearchSettings {
  /** @deprecated 搜索国家由站点目标市场 / 任务创建时选择，不再在站点配置中维护 */
  country?: string;
  /** 最终用于大纲的竞品参考篇数 */
  articleLimit?: number;
  /** 是否优先只保留博客/资讯类 URL */
  articlesOnly?: boolean;
  /** 向 Google 拉取的有机结果条数（过滤前） */
  organicFetchNum?: number;
  /** 博客类不足该数时自动从其余结果回补 */
  minArticleCandidates?: number;
  /** 搜索缓存时长（小时），0 = 不缓存 */
  cacheTtlHours?: number;
}

export interface ResolvedSerpResearchOptions {
  serpCountry: string;
  serpArticleLimit: number;
  serpArticlesOnly: boolean;
  organicFetchNum: number;
  minArticleCandidates: number;
  /** 0 表示不读写缓存 */
  cacheTtlSeconds: number;
}

export type SerpResearchOverrides = Partial<
  Pick<ResolvedSerpResearchOptions, 'serpArticleLimit' | 'serpArticlesOnly' | 'serpCountry'> & {
    organicFetchNum?: number;
    minArticleCandidates?: number;
    bypassCache?: boolean;
  }
>;

const SERP_COUNTRIES = new Set(['US', 'GB', 'CA', 'AU', 'SG', 'IN', 'DE', 'FR', 'JP', 'KR', 'VN']);

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeSerpCountry(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return SERP_COUNTRIES.has(normalized) ? normalized : undefined;
}

/** 校验并规范化 Google 搜索国家（Serper gl） */
export function coerceSerpCountry(value: unknown, fallback = 'US'): string {
  return normalizeSerpCountry(value) ?? fallback;
}

export { normalizeSerpCountry };

export function parseSiteSerpResearchSettings(raw: unknown): SiteSerpResearchSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const record = raw as Record<string, unknown>;
  const parsed: SiteSerpResearchSettings = {};

  const country = normalizeSerpCountry(record.country);
  if (country) {
    parsed.country = country;
  }

  if (record.articleLimit !== undefined) {
    parsed.articleLimit = clampInt(
      record.articleLimit,
      1,
      MAX_SERP_ARTICLE_LIMIT,
      DEFAULT_SERP_ARTICLE_LIMIT,
    );
  }
  if (typeof record.articlesOnly === 'boolean') {
    parsed.articlesOnly = record.articlesOnly;
  }
  if (record.organicFetchNum !== undefined) {
    parsed.organicFetchNum = clampInt(
      record.organicFetchNum,
      MIN_SERPER_ORGANIC_NUM,
      MAX_SERPER_ORGANIC_NUM,
      SERPER_ORGANIC_NUM,
    );
  }
  if (record.minArticleCandidates !== undefined) {
    parsed.minArticleCandidates = clampInt(
      record.minArticleCandidates,
      1,
      MAX_SERP_ARTICLE_LIMIT,
      MIN_SERP_ARTICLE_CANDIDATES,
    );
  }
  if (record.cacheTtlHours !== undefined) {
    parsed.cacheTtlHours = clampInt(
      record.cacheTtlHours,
      MIN_SERP_CACHE_TTL_HOURS,
      MAX_SERP_CACHE_TTL_HOURS,
      DEFAULT_SERP_CACHE_TTL_HOURS,
    );
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function mergeSiteSerpResearchSettings(
  existing: SiteSerpResearchSettings | undefined,
  patch: SiteSerpResearchSettings | undefined,
): SiteSerpResearchSettings | undefined {
  if (!patch) return existing;

  const merged: SiteSerpResearchSettings = { ...(existing ?? {}) };

  const country = normalizeSerpCountry(patch.country);
  if (country !== undefined) {
    merged.country = country;
  }

  if (patch.articleLimit !== undefined) {
    merged.articleLimit = clampInt(
      patch.articleLimit,
      1,
      MAX_SERP_ARTICLE_LIMIT,
      DEFAULT_SERP_ARTICLE_LIMIT,
    );
  }
  if (patch.articlesOnly !== undefined) {
    merged.articlesOnly = patch.articlesOnly;
  }
  if (patch.organicFetchNum !== undefined) {
    merged.organicFetchNum = clampInt(
      patch.organicFetchNum,
      MIN_SERPER_ORGANIC_NUM,
      MAX_SERPER_ORGANIC_NUM,
      SERPER_ORGANIC_NUM,
    );
  }
  if (patch.minArticleCandidates !== undefined) {
    merged.minArticleCandidates = clampInt(
      patch.minArticleCandidates,
      1,
      MAX_SERP_ARTICLE_LIMIT,
      MIN_SERP_ARTICLE_CANDIDATES,
    );
  }
  if (patch.cacheTtlHours !== undefined) {
    merged.cacheTtlHours = clampInt(
      patch.cacheTtlHours,
      MIN_SERP_CACHE_TTL_HOURS,
      MAX_SERP_CACHE_TTL_HOURS,
      DEFAULT_SERP_CACHE_TTL_HOURS,
    );
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** 合并站点配置与任务级覆盖（创建/刷新接口显式传参优先） */
export function resolveSerpResearchOptions(
  siteSettings: unknown,
  overrides?: SerpResearchOverrides,
  context?: { targetMarket?: string | null },
): ResolvedSerpResearchOptions {
  const siteRoot = (siteSettings ?? {}) as { serpResearch?: unknown };
  const site = parseSiteSerpResearchSettings(siteRoot.serpResearch) ?? {};

  const fromTargetMarket = resolveSerpCountriesFromTargetMarkets(
    context?.targetMarket,
    (value) => normalizeSerpCountry(value) !== undefined,
  );

  const serpCountry =
    normalizeSerpCountry(overrides?.serpCountry) ??
    (fromTargetMarket[0] ? normalizeSerpCountry(fromTargetMarket[0]) : undefined) ??
    normalizeSerpCountry(site.country) ??
    'US';

  const serpArticleLimit = clampInt(
    overrides?.serpArticleLimit ?? site.articleLimit,
    1,
    MAX_SERP_ARTICLE_LIMIT,
    DEFAULT_SERP_ARTICLE_LIMIT,
  );

  const serpArticlesOnly =
    overrides?.serpArticlesOnly ?? site.articlesOnly ?? true;

  const organicFetchNum = clampInt(
    overrides?.organicFetchNum ?? site.organicFetchNum,
    MIN_SERPER_ORGANIC_NUM,
    MAX_SERPER_ORGANIC_NUM,
    SERPER_ORGANIC_NUM,
  );

  const minArticleCandidates = clampInt(
    overrides?.minArticleCandidates ?? site.minArticleCandidates,
    1,
    MAX_SERP_ARTICLE_LIMIT,
    MIN_SERP_ARTICLE_CANDIDATES,
  );

  const cacheTtlHours = clampInt(
    site.cacheTtlHours,
    MIN_SERP_CACHE_TTL_HOURS,
    MAX_SERP_CACHE_TTL_HOURS,
    DEFAULT_SERP_CACHE_TTL_HOURS,
  );

  return {
    serpCountry,
    serpArticleLimit,
    serpArticlesOnly,
    organicFetchNum,
    minArticleCandidates,
    cacheTtlSeconds: cacheTtlHours * 3600,
  };
}
