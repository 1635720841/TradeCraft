/**
 * 工作流进度与续跑步骤展示文案。
 */
import type {
  ArticleJobWorkflowProgress,
  ArticleJobWorkflowStep
} from "@/api/seo-factory/types";

const WORKFLOW_STEP_LABELS: Record<ArticleJobWorkflowStep, string> = {
  serp: "SERP 采集",
  brief: "Brief 大纲",
  draft: "初稿生成",
  linking: "内链注入",
  images: "配图生成",
  optimizing: "SEO 优化",
  paraphrasing: "QuillBot 润色",
  ymyl: "YMYL 审查"
};

export function workflowStepLabel(step?: ArticleJobWorkflowStep | string): string {
  if (!step) return "—";
  return WORKFLOW_STEP_LABELS[step as ArticleJobWorkflowStep] ?? step;
}

export function formatWorkflowProgressMessage(
  progress?: ArticleJobWorkflowProgress | null
): string | null {
  if (!progress?.message) return null;
  if (progress.round != null && progress.maxRounds != null) {
    return `${progress.message}`;
  }
  return progress.message;
}

export function formatWorkflowProgressShort(
  progress?: ArticleJobWorkflowProgress | null
): string | null {
  if (!progress) return null;
  if (progress.message) return progress.message;
  if (progress.phase === "local" && progress.round != null && progress.maxRounds != null) {
    return `本地优化 ${progress.round}/${progress.maxRounds} 轮`;
  }
  if (progress.phase === "semrush" && progress.round != null && progress.maxRounds != null) {
    return `Semrush 优化 ${progress.round}/${progress.maxRounds} 轮`;
  }
  if (progress.phase === "semrush-check") return "Semrush 终检中";
  if (progress.phase === "paraphrasing") return progress.message ?? "QuillBot 润色中";
  if (progress.phase === "local-scoring") return "本地预检计分中";
  return null;
}
