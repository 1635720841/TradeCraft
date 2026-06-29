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
import { isBriefPending, isReviewPending } from "@/utils/seo-factory/job-progress";
import { isJobReleaseReady } from "@/utils/seo-factory/release-readiness";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";

export interface JobListPrimaryTag {
  label: string;
  type: "info" | "success" | "warning" | "danger" | "primary";
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
  if (job.status === "COMPLETED" && !isJobReleaseReady(job)) {
    return { label: "SEO 未达标", type: "warning" };
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
    label: dictLabel(jobStatusDict, job.status),
    type: dictTagType(jobStatusDict, job.status) as JobListPrimaryTag["type"]
  };
}
