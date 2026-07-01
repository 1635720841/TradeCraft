/**
 * 任务列表列展示：时间、分数、生成进度副文案。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { formatJobProgressHeadline } from "@/utils/seo-factory/job-progress";
import { resolveEffectiveLocalSeoScore } from "@/utils/seo-factory/local-seo-display";
import { formatWorkflowProgressShort } from "@/utils/seo-factory/workflow-progress";

export function formatJobListUpdatedAt(iso?: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatJobListSeoScores(job: ArticleJobItem): string {
  if (job.status !== "COMPLETED") return "-";

  const local = resolveEffectiveLocalSeoScore(job);
  const semrush = job.semrushScore;
  const parts: string[] = [];

  if (typeof local === "number") {
    parts.push(`本地 ${local}`);
  }
  if (typeof semrush === "number") {
    parts.push(`Sem ${semrush}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "-";
}

export function jobListProgressHint(job: ArticleJobItem): string | null {
  if (job.status === "COMPLETED" || job.status === "FAILED") return null;
  if (job.status === "PAUSED" || job.status === "QUEUED") {
    return formatJobProgressHeadline(job);
  }
  return (
    formatWorkflowProgressShort(job.seoCheckData?.workflowProgress) ??
    formatJobProgressHeadline(job)
  );
}
