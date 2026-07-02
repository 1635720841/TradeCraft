/**
 * 站点自动生产配置（存于 site.settings.autopilot）。
 *
 * 边界：
 * - 不负责：定时调度实现（AutopilotScheduler）
 * - 不负责：关键词入队与 CMS 推送（AutopilotService）
 */

export const AUTOPILOT_KEYWORD_SOURCES = ['priority_pool', 'gsc_opportunity', 'both'] as const;
export type AutopilotKeywordSource = (typeof AUTOPILOT_KEYWORD_SOURCES)[number];

export const AUTOPILOT_PUBLISH_MODES = ['none', 'draft', 'publish'] as const;
export type AutopilotPublishMode = (typeof AUTOPILOT_PUBLISH_MODES)[number];

export const DEFAULT_AUTOPILOT_ARTICLES_PER_RUN = 1;
export const MIN_AUTOPILOT_ARTICLES_PER_RUN = 1;
export const MAX_AUTOPILOT_ARTICLES_PER_RUN = 10;

/** 默认每天运行（0=周日 … 6=周六，UTC 日历日） */
export const DEFAULT_AUTOPILOT_RUN_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** 默认 09:00 北京时间（UTC+8 → UTC 1） */
export const DEFAULT_AUTOPILOT_RUN_HOUR_UTC = 1;

export const AUTOPILOT_LAST_RUN_STATUSES = ['enqueued', 'skipped', 'failed'] as const;
export type AutopilotLastRunStatus = (typeof AUTOPILOT_LAST_RUN_STATUSES)[number];

export interface SiteAutopilotLastRun {
  at: string;
  status: AutopilotLastRunStatus;
  reason?: string;
  jobsEnqueued?: number;
  jobIds?: string[];
}

export interface SiteAutopilotSettings {
  /** 总开关：开启后按周期自动选词并入队生成 */
  enabled?: boolean;
  /** 每次运行最多入队篇数 */
  articlesPerRun?: number;
  /** 关键词来源：词库优先级 / GSC 机会词 / 两者互补 */
  keywordSource?: AutopilotKeywordSource;
  /** 生成完成后 CMS 动作：仅生成 / 推草稿 / 直接发布 */
  publishMode?: AutopilotPublishMode;
  /** 运行星期（0=周日 … 6=周六，UTC） */
  runDaysOfWeek?: number[];
  /** 运行时刻（0–23，UTC） */
  runHourUtc?: number;
  /** 最近一次自动生产运行快照（系统写入，用户 PATCH 不可覆盖） */
  lastRun?: SiteAutopilotLastRun;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseRunDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_AUTOPILOT_RUN_DAYS];
  }

  const days = [...new Set(value.map((item) => clampInt(item, 0, 6, -1)).filter((item) => item >= 0))];
  return days.length > 0 ? days.sort((a, b) => a - b) : [...DEFAULT_AUTOPILOT_RUN_DAYS];
}

function parseKeywordSource(value: unknown): AutopilotKeywordSource {
  return AUTOPILOT_KEYWORD_SOURCES.includes(value as AutopilotKeywordSource)
    ? (value as AutopilotKeywordSource)
    : 'priority_pool';
}

function parsePublishMode(value: unknown): AutopilotPublishMode {
  return AUTOPILOT_PUBLISH_MODES.includes(value as AutopilotPublishMode)
    ? (value as AutopilotPublishMode)
    : 'none';
}

function parseLastRun(value: unknown): SiteAutopilotLastRun | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (!AUTOPILOT_LAST_RUN_STATUSES.includes(status as AutopilotLastRunStatus)) {
    return undefined;
  }
  const at = typeof record.at === 'string' ? record.at : '';
  if (!at) return undefined;

  const parsed: SiteAutopilotLastRun = {
    at,
    status: status as AutopilotLastRunStatus,
  };
  if (typeof record.reason === 'string' && record.reason.trim()) {
    parsed.reason = record.reason.trim();
  }
  if (typeof record.jobsEnqueued === 'number' && Number.isFinite(record.jobsEnqueued)) {
    parsed.jobsEnqueued = Math.max(0, Math.trunc(record.jobsEnqueued));
  }
  if (Array.isArray(record.jobIds)) {
    parsed.jobIds = record.jobIds.filter((item): item is string => typeof item === 'string');
  }
  return parsed;
}

export function parseSiteAutopilotSettings(raw: unknown): SiteAutopilotSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const record = raw as Record<string, unknown>;
  const parsed: SiteAutopilotSettings = {
    enabled: record.enabled === true,
    articlesPerRun: clampInt(
      record.articlesPerRun,
      MIN_AUTOPILOT_ARTICLES_PER_RUN,
      MAX_AUTOPILOT_ARTICLES_PER_RUN,
      DEFAULT_AUTOPILOT_ARTICLES_PER_RUN,
    ),
    keywordSource: parseKeywordSource(record.keywordSource),
    publishMode: parsePublishMode(record.publishMode),
    runDaysOfWeek: parseRunDaysOfWeek(record.runDaysOfWeek),
    runHourUtc: clampInt(record.runHourUtc, 0, 23, DEFAULT_AUTOPILOT_RUN_HOUR_UTC),
  };

  const lastRun = parseLastRun(record.lastRun);
  if (lastRun) {
    parsed.lastRun = lastRun;
  }

  return parsed;
}

export function resolveSiteAutopilotSettings(settings: unknown): SiteAutopilotSettings {
  const parsed = parseSiteAutopilotSettings(
    (settings as { autopilot?: unknown } | null)?.autopilot,
  );
  return (
    parsed ?? {
      enabled: false,
      articlesPerRun: DEFAULT_AUTOPILOT_ARTICLES_PER_RUN,
      keywordSource: 'priority_pool',
      publishMode: 'none',
      runDaysOfWeek: [...DEFAULT_AUTOPILOT_RUN_DAYS],
      runHourUtc: DEFAULT_AUTOPILOT_RUN_HOUR_UTC,
    }
  );
}

export function isAutopilotEnabled(settings: unknown): boolean {
  return resolveSiteAutopilotSettings(settings).enabled === true;
}

/** 当前 UTC 时刻是否命中站点自动生产计划 */
export function isAutopilotDueNow(settings: unknown, now = new Date()): boolean {
  const autopilot = resolveSiteAutopilotSettings(settings);
  if (!autopilot.enabled) return false;

  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return (autopilot.runDaysOfWeek ?? []).includes(day) && autopilot.runHourUtc === hour;
}

export function mergeSiteAutopilotSettings(
  existing: SiteAutopilotSettings | undefined,
  patch: SiteAutopilotSettings | undefined,
): SiteAutopilotSettings | undefined {
  if (!patch) return existing;

  const merged: SiteAutopilotSettings = {
    ...resolveSiteAutopilotSettings(existing ? { autopilot: existing } : null),
  };

  if (patch.enabled !== undefined) {
    merged.enabled = patch.enabled === true;
  }
  if (patch.articlesPerRun !== undefined) {
    merged.articlesPerRun = clampInt(
      patch.articlesPerRun,
      MIN_AUTOPILOT_ARTICLES_PER_RUN,
      MAX_AUTOPILOT_ARTICLES_PER_RUN,
      DEFAULT_AUTOPILOT_ARTICLES_PER_RUN,
    );
  }
  if (patch.keywordSource !== undefined) {
    merged.keywordSource = parseKeywordSource(patch.keywordSource);
  }
  if (patch.publishMode !== undefined) {
    merged.publishMode = parsePublishMode(patch.publishMode);
  }
  if (patch.runDaysOfWeek !== undefined) {
    merged.runDaysOfWeek = parseRunDaysOfWeek(patch.runDaysOfWeek);
  }
  if (patch.runHourUtc !== undefined) {
    merged.runHourUtc = clampInt(patch.runHourUtc, 0, 23, DEFAULT_AUTOPILOT_RUN_HOUR_UTC);
  }

  if (existing?.lastRun) {
    merged.lastRun = existing.lastRun;
  }

  return merged;
}

export function buildAutopilotLastRun(result: {
  status: AutopilotLastRunStatus;
  reason?: string;
  created?: number;
  jobIds?: string[];
}): SiteAutopilotLastRun {
  const snapshot: SiteAutopilotLastRun = {
    at: new Date().toISOString(),
    status: result.status,
  };
  if (result.reason) snapshot.reason = result.reason;
  if (typeof result.created === 'number') snapshot.jobsEnqueued = result.created;
  if (result.jobIds?.length) snapshot.jobIds = result.jobIds;
  return snapshot;
}
