/**
 * 文章任务人工编辑守卫（配图、内链等与后端 IMAGE_MUTATION_BLOCKED 对齐）。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";

/** 流水线忙碌中：阻塞配图/内链等人工编辑 */
const PIPELINE_BUSY_STATUSES = new Set([
  "QUEUED",
  "RESEARCHING",
  "DRAFTING",
  "LINKING",
  "ILLUSTRATING",
  "OPTIMIZING"
]);

export function isArticleJobPipelineBusy(status: string): boolean {
  return PIPELINE_BUSY_STATUSES.has(status);
}

/** 配图/内链面板是否允许人工编辑 */
export function isArticleJobContentEditable(job: Pick<ArticleJobItem, "status">): boolean {
  if (job.status === "CANCELLED" || job.status === "FAILED") return false;
  if (job.status === "COMPLETED" || job.status === "PAUSED") return true;
  return !isArticleJobPipelineBusy(job.status);
}
