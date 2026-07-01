/**
 * 任务列表主状态标签：合并阶段、审核、改稿与 CMS 状态为一项展示。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { jobStatusDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import {
  cmsPublishStatusLabel,
  cmsPublishStatusTagType,
  resolveCmsPublishStatus
} from "@/utils/seo-factory/cms-publish-status";
import { draftEditStatusLabel } from "@/utils/seo-factory/draft-edit-preview";
import { isBriefPending, isReviewPending, inferCurrentWorkflowStep } from "@/utils/seo-factory/job-progress";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";

export interface JobListPrimaryTag {
  label: string;
  type: "info" | "success" | "warning" | "danger" | "primary";
}

/** 列表/详情展示用状态：从暂停恢复后若仍为 QUEUED，按断点步骤显示对应阶段。 */
export function resolveJobDisplayStatus(job: ArticleJobItem): string {
  if (job.status === "PAUSED") return job.status;
  if (job.status !== "QUEUED") return job.status;
  const paused = inferCurrentWorkflowStep(job);
  if (!paused || paused === "serp") return job.status;
  switch (paused) {
    case "brief":
    case "draft":
      return "DRAFTING";
    case "linking":
      return "LINKING";
    case "images":
      return "ILLUSTRATING";
    case "optimizing":
    case "paraphrasing":
      return "OPTIMIZING";
    case "ymyl":
      return "REVIEWING";
    default:
      return job.status;
  }
}

export function resolveJobListPrimaryTag(job: ArticleJobItem): JobListPrimaryTag {
  if (isBriefPending(job)) {
    return { label: "待确认大纲", type: "warning" };
  }
  if (isReviewPending(job)) {
    return { label: "敏感内容待审核", type: "warning" };
  }
  const staleLabel = draftEditStatusLabel(job);
  if (staleLabel) {
    return { label: "改稿待处理", type: "warning" };
  }
  if (WORDPRESS_CMS_UI_ENABLED) {
    const cmsStatus = resolveCmsPublishStatus(job);
    if (cmsStatus === "pending" || cmsStatus === "failed") {
      return {
        label: cmsPublishStatusLabel(cmsStatus, job),
        type: cmsPublishStatusTagType(cmsStatus)
      };
    }
  }
  return {
    label: dictLabel(jobStatusDict, resolveJobDisplayStatus(job)),
    type: dictTagType(jobStatusDict, resolveJobDisplayStatus(job)) as JobListPrimaryTag["type"]
  };
}
