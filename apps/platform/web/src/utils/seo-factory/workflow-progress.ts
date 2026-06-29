/**
 * 工作流进度与续跑步骤展示文案。
 */
import type {
  ArticleJobWorkflowProgress,
  ArticleJobWorkflowStep
} from "@/api/seo-factory/types";

const WORKFLOW_STEP_LABELS: Record<ArticleJobWorkflowStep, string> = {
  serp: "分析搜索结果",
  brief: "生成大纲",
  draft: "撰写正文",
  linking: "植入站内链接",
  images: "生成配图",
  optimizing: "SEO 评分优化",
  paraphrasing: "原创度优化",
  ymyl: "内容安全审查"
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
  if (progress.phase === "paraphrasing") return progress.message ?? "原创表达优化中";
  if (progress.phase === "local-scoring") return "本地预检计分中";
  return null;
}
