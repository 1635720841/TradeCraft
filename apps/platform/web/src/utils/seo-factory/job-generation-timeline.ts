/**
 * 任务生成时间线：从 job 数据与活动记录前端合成。
 */

import type { ArticleJobItem } from "@/api/seo-factory/types";
import type { JobActivityItem } from "@/api/seo-factory/article-job-activity";
import { buildJobProgressSteps } from "./job-progress";
import { workflowStepLabel } from "./workflow-progress";

export type GenerationTimelineKind = "step" | "event";

export interface GenerationTimelineEntry {
  id: string;
  kind: GenerationTimelineKind;
  title: string;
  description?: string;
  timestamp?: string;
  state: "done" | "current" | "pending" | "failed";
}

export function buildJobGenerationTimeline(
  job: ArticleJobItem,
  activityItems: JobActivityItem[] = []
): GenerationTimelineEntry[] {
  const steps = buildJobProgressSteps(job);
  const entries: GenerationTimelineEntry[] = steps.map((step) => ({
    id: `step-${step.key}`,
    kind: "step",
    title: step.label,
    description:
      step.state === "current"
        ? job.seoCheckData?.workflowProgress?.message ?? step.estimate
        : step.state === "done"
          ? step.estimate
          : step.estimate,
    state: step.state
  }));

  const events: GenerationTimelineEntry[] = [];

  if (job.createdAt) {
    events.push({
      id: "event-created",
      kind: "event",
      title: "任务已创建",
      timestamp: job.createdAt,
      state: "done"
    });
  }

  if (job.briefData?.approvedAt) {
    events.push({
      id: "event-brief-approved",
      kind: "event",
      title: "大纲已确认",
      timestamp: job.briefData.approvedAt,
      state: "done"
    });
  }

  const optimizeHistory = [
    ...(job.draftData?.optimizeHistory ?? []),
    ...(job.seoCheckData?.optimizeHistory ?? [])
  ];
  const seenOptimize = new Set<string>();
  for (const round of optimizeHistory) {
    if (!round.optimizedAt || seenOptimize.has(round.optimizedAt)) continue;
    seenOptimize.add(round.optimizedAt);
    const phaseLabel =
      round.phase === "semrush"
        ? "Semrush 优化"
        : round.phase === "local"
          ? "本地 SEO 优化"
          : "SEO 优化";
    events.push({
      id: `event-optimize-${round.optimizedAt}`,
      kind: "event",
      title: `${phaseLabel} 第 ${round.round ?? "?"} 轮`,
      description: round.changesSummary?.join("；") ?? undefined,
      timestamp: round.optimizedAt,
      state: "done"
    });
  }

  for (const snap of job.seoCheckData?.analysisSnapshots ?? []) {
    if (!snap.checkedAt) continue;
    events.push({
      id: `event-snapshot-${snap.checkedAt}`,
      kind: "event",
      title: "SEO 检测快照",
      description: `本地 ${snap.localScore ?? "—"} · Semrush ${snap.semrushOverall ?? "—"}`,
      timestamp: snap.checkedAt,
      state: "done"
    });
  }

  for (const item of activityItems) {
    events.push({
      id: `activity-${item.id}`,
      kind: "event",
      title: item.summary,
      description: item.actor?.name || item.actor?.email || undefined,
      timestamp: item.createdAt,
      state: "done"
    });
  }

  if (job.status === "FAILED" && job.seoCheckData?.workflow?.failedStep) {
    const failedStep = job.seoCheckData.workflow.failedStep;
    events.push({
      id: "event-failed",
      kind: "event",
      title: `失败于 ${workflowStepLabel(failedStep)}`,
      description: job.errorMessage ?? undefined,
      timestamp: job.updatedAt,
      state: "failed"
    });
  }

  if (job.status === "COMPLETED") {
    events.push({
      id: "event-completed",
      kind: "event",
      title: "任务已完成",
      timestamp: job.updatedAt,
      state: "done"
    });
  }

  events.sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
    const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
    return ta - tb;
  });

  return [...entries, ...events];
}

export function countCompletedSteps(job: ArticleJobItem): number {
  return buildJobProgressSteps(job).filter((s) => s.state === "done").length;
}
