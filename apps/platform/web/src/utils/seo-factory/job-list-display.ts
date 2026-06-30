/**
 * 任务列表列展示：时间、分数、生成进度副文案。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";
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
  if (JOB_TERMINAL_STATUSES.includes(job.status as (typeof JOB_TERMINAL_STATUSES)[number])) {
    return null;
  }
  return formatWorkflowProgressShort(job.seoCheckData?.workflowProgress);
}
