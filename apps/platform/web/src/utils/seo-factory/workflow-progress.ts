/**
 * 工作流进度与续跑步骤展示文案。
 */
import type {
  ArticleJobWorkflowProgress,
  ArticleJobWorkflowStep
} from "@/api/seo-factory/types";
import {
  enrichWorkflowProgressMessage,
  WORKFLOW_STEP_LABELS,
  workflowStepLabel as sharedWorkflowStepLabel
} from "@wm/shared-core";

export function workflowStepLabel(step?: ArticleJobWorkflowStep | string): string {
  return sharedWorkflowStepLabel(step);
}

export { WORKFLOW_STEP_LABELS };

export function formatWorkflowProgressShort(
  progress?: ArticleJobWorkflowProgress | null
): string | null {
  return enrichWorkflowProgressMessage(progress ?? null);
}

export function formatWorkflowProgressMessage(
  progress?: ArticleJobWorkflowProgress | null
): string | null {
  return formatWorkflowProgressShort(progress);
}
