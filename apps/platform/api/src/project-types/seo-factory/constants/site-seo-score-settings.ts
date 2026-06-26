/**
 * 站点 SEO 评分门槛与优化轮次：存于 site.settings，未配置时用 seo-score 默认值。
 */

import {
  LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  LOCAL_SEO_PASS_THRESHOLD,
  LOCAL_SEO_RETRY_EXTRA_ROUNDS,
  SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  SEMRUSH_PASS_THRESHOLD,
  SEMRUSH_RETRY_EXTRA_ROUNDS,
} from './seo-score';

export interface SiteSeoScoreSettings {
  /** 本地预检通过线，默认 95 */
  localPassThreshold?: number;
  /** Semrush 终检通过线，默认 9.0 */
  semrushPassThreshold?: number;
  /** 本地优化最大轮次，默认 5 */
  localMaxOptimizeRounds?: number;
  /** 本地失败重试追加轮次，默认 3 */
  localRetryExtraRounds?: number;
  /** Semrush 优化最大轮次，默认 5 */
  semrushMaxOptimizeRounds?: number;
  /** Semrush 失败重试追加轮次，默认 4 */
  semrushRetryExtraRounds?: number;
}

export interface ResolvedSiteSeoScoreConfig {
  localPassThreshold: number;
  semrushPassThreshold: number;
  localMaxOptimizeRounds: number;
  localRetryExtraRounds: number;
  semrushMaxOptimizeRounds: number;
  semrushRetryExtraRounds: number;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}

/** 从站点 settings JSON 解析评分配置（含边界钳制） */
export function resolveSiteSeoScoreConfig(settings: unknown): ResolvedSiteSeoScoreConfig {
  const raw = (settings ?? {}) as SiteSeoScoreSettings;
  return {
    localPassThreshold: clampInt(raw.localPassThreshold, 70, 100, LOCAL_SEO_PASS_THRESHOLD),
    semrushPassThreshold: clampFloat(raw.semrushPassThreshold, 7.0, 10.0, SEMRUSH_PASS_THRESHOLD),
    localMaxOptimizeRounds: clampInt(
      raw.localMaxOptimizeRounds,
      1,
      15,
      LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
    ),
    localRetryExtraRounds: clampInt(
      raw.localRetryExtraRounds,
      0,
      10,
      LOCAL_SEO_RETRY_EXTRA_ROUNDS,
    ),
    semrushMaxOptimizeRounds: clampInt(
      raw.semrushMaxOptimizeRounds,
      1,
      15,
      SEMRUSH_MAX_OPTIMIZE_ROUNDS,
    ),
    semrushRetryExtraRounds: clampInt(
      raw.semrushRetryExtraRounds,
      0,
      10,
      SEMRUSH_RETRY_EXTRA_ROUNDS,
    ),
  };
}

export const DEFAULT_SITE_SEO_SCORE_CONFIG = resolveSiteSeoScoreConfig(undefined);

/** 站点是否在 settings 里显式配置过本地通过分 */
export function hasExplicitLocalPassThreshold(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  return (settings as SiteSeoScoreSettings).localPassThreshold !== undefined;
}

/** 站点是否在 settings 里显式配置过评分项（显式配置时优化轮次为硬上限，不再叠加 near-miss 加成） */
export function hasExplicitSiteSeoScoreSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const raw = settings as SiteSeoScoreSettings;
  return (
    raw.localPassThreshold !== undefined ||
    raw.semrushPassThreshold !== undefined ||
    raw.localMaxOptimizeRounds !== undefined ||
    raw.localRetryExtraRounds !== undefined ||
    raw.semrushMaxOptimizeRounds !== undefined ||
    raw.semrushRetryExtraRounds !== undefined
  );
}

export function buildScoreThresholdsSnapshot(
  config: ResolvedSiteSeoScoreConfig,
): ResolvedSiteSeoScoreConfig {
  return { ...config };
}
