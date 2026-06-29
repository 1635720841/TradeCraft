/**
 * 任务详情「下一步」引导逻辑。
 */
import { computed, type ComputedRef, type Ref } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { isJobReleaseReady } from "@/utils/seo-factory/release-readiness";

export type NextStepAlertType = "success" | "warning" | "info" | "error";
export type NextStepButtonType = "primary" | "success" | "warning" | "danger";

export interface NextStepAction {
  title: string;
  description?: string;
  label: string;
  alertType: NextStepAlertType;
  buttonType: NextStepButtonType;
  handler: () => void;
}

export interface UseJobNextStepOptions {
  job: Ref<ArticleJobItem | null | undefined>;
  briefPending: Ref<boolean>;
  exportStale: Ref<boolean>;
  requiresHumanReview: Ref<boolean>;
  ymylHumanReviewStatus: Ref<string | undefined>;
  cmsUiEnabled: boolean;
  canPublishToCms: Ref<boolean>;
  cmsPublishButtonLabel: Ref<string>;
  handlers: {
    goBrief: () => void;
    goDiagnose: (section?: string) => void;
    goArticle: () => void;
    handleRetry: () => void | Promise<void>;
    handlePublishToCms: () => void | Promise<void>;
    handleDownloadHtml: () => void | Promise<void>;
    handleRerunOptimization: () => void | Promise<void>;
  };
}

export function useJobNextStep(
  options: UseJobNextStepOptions
): ComputedRef<NextStepAction | null> {
  return computed<NextStepAction | null>(() => {
    const j = options.job.value;
    if (!j) return null;

    if (options.briefPending.value) {
      return {
        title: "下一步：确认大纲",
        description: "核对 AI 大纲后确认，系统才会开始生成正文。",
        label: "去确认大纲",
        alertType: "warning",
        buttonType: "warning",
        handler: options.handlers.goBrief
      };
    }

    if (j.status === "FAILED") {
      return {
        title: "下一步：重新生成",
        description: j.errorMessage || "任务生成失败，可从失败步骤继续。",
        label: "重新生成",
        alertType: "error",
        buttonType: "danger",
        handler: () => {
          void options.handlers.handleRetry();
        }
      };
    }

    if (
      options.requiresHumanReview.value &&
      options.ymylHumanReviewStatus.value !== "approved"
    ) {
      return {
        title: "下一步：敏感内容审核",
        description: "需人工审核通过后才能导出或发布。",
        label: "去审核",
        alertType: "warning",
        buttonType: "warning",
        handler: () => options.handlers.goDiagnose("ymyl")
      };
    }

    if (options.exportStale.value) {
      return {
        title: "下一步：处理稿件变更",
        description: "正文已编辑，导出物已失效，请按黄色提示重新处理。",
        label: "去处理稿件",
        alertType: "warning",
        buttonType: "warning",
        handler: options.handlers.goArticle
      };
    }

    if (j.status === "COMPLETED" && !isJobReleaseReady(j)) {
      return {
        title: "下一步：提升 SEO 分数",
        description: "本地或 Semrush 尚未达标，建议先查看诊断并重新优化。",
        label: "去诊断",
        alertType: "warning",
        buttonType: "warning",
        handler: () => options.handlers.goDiagnose("seo")
      };
    }

    if (options.cmsUiEnabled && options.canPublishToCms.value) {
      return {
        title: "下一步：推送到 CMS 草稿",
        description: "文章已达标，可推送到 CMS 草稿箱，再在后台正式发布。",
        label: options.cmsPublishButtonLabel.value,
        alertType: "success",
        buttonType: "success",
        handler: () => {
          void options.handlers.handlePublishToCms();
        }
      };
    }

    if (j.status === "COMPLETED" && j.outputUrl && !options.exportStale.value) {
      return {
        title: "下一步：下载文章",
        description: "文章已生成完成，可下载 HTML 或资产包。",
        label: "下载 HTML",
        alertType: "success",
        buttonType: "primary",
        handler: () => {
          void options.handlers.handleDownloadHtml();
        }
      };
    }

    return null;
  });
}
