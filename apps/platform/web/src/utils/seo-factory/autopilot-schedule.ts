/**
 * 自动生产计划预设（前端）：与后端 site-autopilot-schedule.util 保持一致。
 */

export const AUTOPILOT_BEIJING_UTC_OFFSET = 8;

export const AUTOPILOT_SCHEDULE_PRESETS = {
  daily_1: { runDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], articlesPerRun: 1 },
  daily_2: { runDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], articlesPerRun: 2 },
  daily_3: { runDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], articlesPerRun: 3 },
  weekly_1: { runDaysOfWeek: [1], articlesPerRun: 1 },
  weekly_3: { runDaysOfWeek: [1, 3, 5], articlesPerRun: 1 }
} as const;

export type AutopilotSchedulePreset = keyof typeof AUTOPILOT_SCHEDULE_PRESETS | "custom";

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function normalizeDays(days: number[] | undefined): number[] {
  return [...new Set((days ?? []).map(day => Math.trunc(day)).filter(day => day >= 0 && day <= 6))].sort(
    (a, b) => a - b
  );
}

function daysEqual(left: number[], right: number[]): boolean {
  const a = normalizeDays(left);
  const b = normalizeDays(right);
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

export function beijingHourToUtcHour(beijingHour: number): number {
  return (beijingHour - AUTOPILOT_BEIJING_UTC_OFFSET + 24) % 24;
}

export function utcHourToBeijingHour(utcHour: number): number {
  return (utcHour + AUTOPILOT_BEIJING_UTC_OFFSET) % 24;
}

export function inferAutopilotSchedulePreset(
  runDaysOfWeek: number[] | undefined,
  articlesPerRun: number | undefined
): AutopilotSchedulePreset {
  const days = normalizeDays(runDaysOfWeek);
  const count = articlesPerRun ?? 1;

  for (const [preset, config] of Object.entries(AUTOPILOT_SCHEDULE_PRESETS)) {
    if (daysEqual(days, [...config.runDaysOfWeek]) && count === config.articlesPerRun) {
      return preset as AutopilotSchedulePreset;
    }
  }

  return "custom";
}

export function applyAutopilotSchedulePreset(preset: AutopilotSchedulePreset): {
  runDaysOfWeek: number[];
  articlesPerRun: number;
} {
  if (preset === "custom") {
    return { runDaysOfWeek: [...ALL_WEEKDAYS], articlesPerRun: 1 };
  }

  const config = AUTOPILOT_SCHEDULE_PRESETS[preset];
  return {
    runDaysOfWeek: [...config.runDaysOfWeek],
    articlesPerRun: config.articlesPerRun
  };
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

function formatWeekdays(days: number[]): string {
  const normalized = normalizeDays(days);
  if (normalized.length === 7) return "每天";
  if (daysEqual(normalized, [1, 3, 5])) return "每周一、三、五";
  if (normalized.length === 1) return `每周${WEEKDAY_LABELS[normalized[0]]}`;
  return normalized.map(day => WEEKDAY_LABELS[day]).join("、");
}

export function describeAutopilotSchedule(input: {
  runDaysOfWeek?: number[];
  articlesPerRun?: number;
  runHourUtc?: number;
}): string {
  const days = normalizeDays(input.runDaysOfWeek);
  const articlesPerRun = input.articlesPerRun ?? 1;
  const beijingHour = utcHourToBeijingHour(input.runHourUtc ?? 1);
  const timeLabel = `${String(beijingHour).padStart(2, "0")}:00`;
  const cadence = formatWeekdays(days);
  const articleLabel = articlesPerRun > 1 ? `${articlesPerRun} 篇` : "1 篇";

  if (days.length === 7) {
    return `每天 ${timeLabel}（北京时间）自动入队 ${articleLabel}`;
  }

  return `${cadence} ${timeLabel}（北京时间）各入队 ${articleLabel}`;
}

export const AUTOPILOT_SCHEDULE_PRESET_OPTIONS: Array<{
  value: AutopilotSchedulePreset;
  label: string;
  hint: string;
}> = [
  { value: "daily_1", label: "每天 1 篇", hint: "适合稳定日更" },
  { value: "daily_2", label: "每天 2 篇", hint: "日更量较大时使用" },
  { value: "daily_3", label: "每天 3 篇", hint: "需充足词库与配额" },
  { value: "weekly_1", label: "每周 1 篇（周一）", hint: "低频试水" },
  { value: "weekly_3", label: "每周 3 篇（一、三、五）", hint: "工作日更新" },
  { value: "custom", label: "自定义", hint: "自行指定星期与篇数" }
];

export const AUTOPILOT_BEIJING_HOUR_OPTIONS = Array.from({ length: 17 }, (_, index) => index + 6);
