/**
 * 从任务数据推断工作流步骤与进度文案（列表/详情步骤条）。
 */
import type { ArticleJobItem, ArticleJobWorkflowStep } from "@/api/seo-factory/types";
import { WORKFLOW_STEP_ESTIMATES, WORKFLOW_STEPS } from "@wm/shared-core";
import { SWA_MIN_IMAGES } from "@/constants/seo-factory";
import { formatWorkflowProgressShort, workflowStepLabel } from "./workflow-progress";
import { countArticleImagesForDisplay } from "./article-images-display";

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

function isParaphraseCompleted(job: ArticleJobItem): boolean {
  if (job.draftData?.paraphraseApplied) return true;
  const quillbot = job.seoCheckData?.quillbot;
  if (quillbot?.skipped) return true;
  return Boolean(quillbot?.completedAt);
}

export function inferCurrentWorkflowStep(job: ArticleJobItem): ArticleJobWorkflowStep | null {
  if (job.status === "COMPLETED" || job.status === "FAILED") return null;
  if (job.status === "PAUSED") {
    const paused = job.seoCheckData?.workflow?.pausedStep;
    return paused ?? null;
  }
  if (job.status === "QUEUED") {
    // 从暂停恢复后会短暂回到 QUEUED，此时优先显示断点步骤，避免视觉上“从头开始”。
    const paused = job.seoCheckData?.workflow?.pausedStep;
    if (paused) return paused;
  }

  if (isBriefPending(job)) return "brief";

  const failedStep = job.seoCheckData?.workflow?.failedStep;
  if (job.status === "FAILED" && failedStep) {
    return failedStep as ArticleJobWorkflowStep;
  }

  if (job.status === "RESEARCHING") return "serp";
  if (job.status === "LINKING") return "linking";
  if (job.status === "ILLUSTRATING") return "images";
  if (job.status === "OPTIMIZING") {
    const progress = job.seoCheckData?.workflowProgress;
    if (progress?.phase === "paraphrasing") return "paraphrasing";

    const draft = job.draftData;
    if (draft?.content && !draft.internalLinksApplied) return "linking";
    const imageCount = countArticleImagesForDisplay(draft?.content, draft?.articleImages);
    if (draft?.content && draft.internalLinksApplied && (!draft.imagesApplied || imageCount < SWA_MIN_IMAGES)) {
      return "images";
    }
    if (isParaphraseCompleted(job)) return "optimizing";
    if (progress?.phase === "semrush" || progress?.phase === "semrush-check") {
      return "optimizing";
    }
    if (job.seoCheckData?.semrush?.passed === true && !isParaphraseCompleted(job)) {
      return "paraphrasing";
    }
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

function isImagesStepComplete(job: ArticleJobItem): boolean {
  if (!job.draftData?.internalLinksApplied) return false;
  const imageCount = countArticleImagesForDisplay(
    job.draftData.content,
    job.draftData.articleImages,
  );
  return job.draftData.imagesApplied === true && imageCount >= SWA_MIN_IMAGES;
}

export function buildJobProgressSteps(job: ArticleJobItem): JobProgressStep[] {
  const current = inferCurrentWorkflowStep(job);
  const currentIndex = current ? WORKFLOW_STEPS.indexOf(current) : WORKFLOW_STEPS.length;
  const failedStep =
    job.status === "FAILED"
      ? (job.seoCheckData?.workflow?.failedStep as ArticleJobWorkflowStep | undefined)
      : undefined;

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

    if (
      key === "images" &&
      job.status !== "COMPLETED" &&
      !isImagesStepComplete(job) &&
      state === "done"
    ) {
      state = current === "images" ? "current" : "pending";
    }

    return {
      key,
      label: workflowStepLabel(key),
      estimate: WORKFLOW_STEP_ESTIMATES[key],
      state
    };
  });
}

export function formatJobProgressHeadline(job: ArticleJobItem): string | null {
  if (job.status === "COMPLETED") return "已完成";
  if (job.status === "PAUSED") return "任务已暂停，可继续执行";
  if (job.status === "QUEUED" && job.seoCheckData?.workflow?.pausedStep) {
    const step = job.seoCheckData.workflow.pausedStep;
    return `从断点继续：${workflowStepLabel(step)}`;
  }
  if (isBriefPending(job)) return "待确认大纲";

  const progressText = formatWorkflowProgressShort(job.seoCheckData?.workflowProgress);
  if (progressText) return progressText;

  const current = inferCurrentWorkflowStep(job);
  if (!current) return null;

  if (job.status === "FAILED") {
    return `失败于 ${workflowStepLabel(current)}，可续跑`;
  }

  return `${workflowStepLabel(current)}（${WORKFLOW_STEP_ESTIMATES[current]}）`;
}
