/** 自动生产上次运行状态展示 */

import type { SiteAutopilotLastRun } from "@/api/seo-factory/types";

const STATUS_LABEL: Record<SiteAutopilotLastRun["status"], string> = {
  enqueued: "已入队",
  skipped: "已跳过",
  failed: "运行失败"
};

const STATUS_TAG: Record<SiteAutopilotLastRun["status"], "success" | "warning" | "error" | "info"> = {
  enqueued: "success",
  skipped: "warning",
  failed: "error"
};

const SKIP_REASON_LABEL: Record<string, string> = {
  disabled: "自动生产已关闭",
  missing_writing_profile: "站点写作素材未达标",
  no_keywords: "没有可入队的关键词"
};

export function getAutopilotRunStatusLabel(status: SiteAutopilotLastRun["status"]): string {
  return STATUS_LABEL[status];
}

export function getAutopilotRunStatusTagType(
  status: SiteAutopilotLastRun["status"]
): "success" | "warning" | "error" | "info" {
  return STATUS_TAG[status];
}

export function getAutopilotRunHint(lastRun?: SiteAutopilotLastRun | null): string {
  if (!lastRun) return "尚未记录自动生产运行";
  const time = formatAutopilotRunTime(lastRun.at);
  if (lastRun.status === "enqueued") {
    const count = lastRun.jobsEnqueued ?? lastRun.jobIds?.length ?? 0;
    return `上次运行于 ${time}，成功入队 ${count} 篇`;
  }
  if (lastRun.status === "skipped") {
    const reason = lastRun.reason
      ? SKIP_REASON_LABEL[lastRun.reason] ?? lastRun.reason
      : "未入队";
    return `上次运行于 ${time}，${reason}`;
  }
  return `上次运行于 ${time}，失败：${lastRun.reason || "未知错误"}`;
}

export function formatAutopilotRunTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}
