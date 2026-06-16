/**
 * 任务详情错误信息展示：Semrush 手动终检中断不应在「已完成」主状态旁显示红色任务错误。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";

export function resolveJobDisplayErrorMessage(
  job: ArticleJobItem | null | undefined
): string | null {
  const msg = job?.errorMessage?.trim();
  if (!msg) return null;

  const semrush = job?.seoCheckData?.semrush;
  if (
    job?.status === "COMPLETED" &&
    (semrush?.lastManualCheckError || semrush?.recoveredOrphanOptimizing)
  ) {
    return null;
  }

  return msg;
}
