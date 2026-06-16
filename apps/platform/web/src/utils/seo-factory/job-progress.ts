/**
 * 从任务数据推断工作流步骤与进度文案（列表/详情步骤条）。
 */
import type { ArticleJobItem, ArticleJobWorkflowStep } from "@/api/seo-factory/types";
import { workflowStepLabel } from "./workflow-progress";

const WORKFLOW_STEPS: ArticleJobWorkflowStep[] = [
  "serp",
  "brief",
  "draft",
  "linking",
  "images",
  "optimizing",
  "paraphrasing",
  "ymyl"
];

const STEP_ESTIMATES: Record<ArticleJobWorkflowStep, string> = {
  serp: "约 1–3 分钟",
  brief: "约 30–60 秒",
  draft: "约 1–2 分钟",
  linking: "约 30 秒",
  images: "约 1–3 分钟",
  optimizing: "约 5–20 分钟",
  paraphrasing: "约 1–2 分钟",
  ymyl: "约 30 秒"
};

export interface JobProgressStep {
  key: ArticleJobWorkflowStep;
  label: string;
  estimate: string;
  state: "done" | "current" | "pending" | "failed";
}

export function isBriefPending(job: ArticleJobItem): boolean {
  return job.briefData?.approvalStatus === "pending";
}

export function isReviewPending(job: ArticleJobItem): boolean {
  if (job.reviewPending === true) return true;
  if (!job.requiresHumanReview || job.status !== "COMPLETED") return false;
  const review = job.seoCheckData?.ymylReview;
  if (!review?.requires_human_review) return false;
  return !review.humanReviewStatus || review.humanReviewStatus === "pending";
}

export function inferCurrentWorkflowStep(job: ArticleJobItem): ArticleJobWorkflowStep | null {
  if (job.status === "COMPLETED" || job.status === "FAILED") return null;

  if (isBriefPending(job)) return "brief";

  const failedStep = job.seoCheckData?.workflow?.failedStep;
  if (job.status === "FAILED" && failedStep) {
    return failedStep as ArticleJobWorkflowStep;
  }

  if (job.status === "RESEARCHING") return "serp";
  if (job.status === "LINKING") return "linking";
  if (job.status === "ILLUSTRATING") return "images";
  if (job.status === "OPTIMIZING") {
    const draft = job.draftData;
    if (draft?.content && !draft.internalLinksApplied) return "linking";
    if (draft?.content && draft.internalLinksApplied && !draft.imagesApplied) return "images";
    return "optimizing";
  }
  if (job.status === "REVIEWING") return "ymyl";
  if (job.status === "DRAFTING") {
    if (job.briefData?.outline || job.briefData?.approvalStatus) return "draft";
    return "brief";
  }
  if (job.status === "QUEUED") return "serp";

  return null;
}

export function buildJobProgressSteps(job: ArticleJobItem): JobProgressStep[] {
  const current = inferCurrentWorkflowStep(job);
  const currentIndex = current ? WORKFLOW_STEPS.indexOf(current) : WORKFLOW_STEPS.length;
  const failedStep =
    job.status === "FAILED" ? (job.seoCheckData?.workflow?.failedStep as ArticleJobWorkflowStep | undefined) : undefined;

  return WORKFLOW_STEPS.map((key, index) => {
    let state: JobProgressStep["state"] = "pending";
    if (job.status === "COMPLETED") {
      state = "done";
    } else if (failedStep === key) {
      state = "failed";
    } else if (index < currentIndex) {
      state = "done";
    } else if (index === currentIndex) {
      state = job.status === "FAILED" ? "failed" : "current";
    }

    return {
      key,
      label: workflowStepLabel(key),
      estimate: STEP_ESTIMATES[key],
      state
    };
  });
}

export function formatJobProgressHeadline(job: ArticleJobItem): string | null {
  if (job.status === "COMPLETED") return "已完成";
  if (isBriefPending(job)) return "待确认大纲";

  const progress = job.seoCheckData?.workflowProgress;
  if (progress?.message) return progress.message;

  const current = inferCurrentWorkflowStep(job);
  if (!current) return null;

  if (job.status === "FAILED") {
    return `失败于 ${workflowStepLabel(current)}，可续跑`;
  }

  return `${workflowStepLabel(current)}（${STEP_ESTIMATES[current]}）`;
}
