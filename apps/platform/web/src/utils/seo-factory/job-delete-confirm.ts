/**
 * 删除文章任务确认文案（列表与详情共用）。
 */
import { ElMessageBox } from "element-plus";
import { JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";

export function buildDeleteConfirmMessage(keyword: string, inProgress: boolean): string {
  const base = `确定删除任务「${keyword}」？删除后不可恢复，将一并清理队列任务、导出文件与稿件插图。`;
  return inProgress ? `${base}\n\n该任务仍在进行中，删除后后台可能短暂报错，可忽略。` : base;
}

export async function confirmDeleteArticleJob(
  keyword: string,
  inProgress: boolean
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(buildDeleteConfirmMessage(keyword, inProgress), "删除任务", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger"
    });
    return true;
  } catch {
    return false;
  }
}

export function isArticleJobInProgress(status: string): boolean {
  return !JOB_TERMINAL_STATUSES.includes(status as (typeof JOB_TERMINAL_STATUSES)[number]);
}
