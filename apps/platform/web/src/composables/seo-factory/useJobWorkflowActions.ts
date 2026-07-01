/**
 * 任务详情工作流操作：暂停、继续、重试、删除、重跑优化等。
 */
import { type Ref } from "vue";
import {
  cancelArticleJob,
  deleteArticleJob,
  pauseArticleJob,
  rerunArticleOptimization,
  rerunArticleParaphrase,
  resumeArticleJob,
  retryArticleJob,
  refreshArticleJobSerp
} from "@/api/seo-factory/article-job";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { PARAPHRASE_RERUN_FAILED, PARAPHRASE_RERUN_QUEUED } from "@wm/shared-core";
import { message } from "@/utils/message";
import {
  confirmDeleteArticleJob,
  isArticleJobInProgress
} from "@/utils/seo-factory/job-delete-confirm";
import type { DiagnoseSection } from "@/utils/seo-factory/job-detail-summary";

export function useJobWorkflowActions(options: {
  projectId: Ref<string>;
  jobId: Ref<string>;
  job: Ref<ArticleJobItem | null>;
  canPause: Ref<boolean>;
  canCancel: Ref<boolean>;
  canResume: Ref<boolean>;
  canRetry: Ref<boolean>;
  canRerunOptimization: Ref<boolean>;
  canRerunParaphrase: Ref<boolean>;
  canRefreshSerp: Ref<boolean>;
  retrying: Ref<boolean>;
  pausing: Ref<boolean>;
  cancelling: Ref<boolean>;
  resuming: Ref<boolean>;
  deleting: Ref<boolean>;
  rerunningOptimization: Ref<boolean>;
  rerunningParaphrase: Ref<boolean>;
  serpRefreshing: Ref<boolean>;
  fetchOnce: () => Promise<void>;
  startPolling: () => void;
  goBack: () => void;
  goDetailTab: (tab: "article" | "diagnose" | "brief", section?: DiagnoseSection) => void;
}) {
  async function handleRetry() {
    if (!options.job.value || !options.canRetry.value || options.retrying.value) return;
    options.retrying.value = true;
    try {
      await retryArticleJob(options.projectId.value, options.jobId.value);
      message("已从失败步骤重新入队，正在重新生成…", { type: "success" });
      options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : "重试失败", { type: "error" });
    } finally {
      options.retrying.value = false;
    }
  }

  async function handlePause() {
    if (!options.job.value || !options.canPause.value || options.pausing.value) return;
    options.pausing.value = true;
    try {
      await pauseArticleJob(options.projectId.value, options.jobId.value);
      message("任务已暂停，可随时继续执行", { type: "success" });
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : "暂停失败", { type: "error" });
    } finally {
      options.pausing.value = false;
    }
  }

  async function handleCancel() {
    if (!options.job.value || !options.canCancel.value || options.cancelling.value) return;
    options.cancelling.value = true;
    try {
      await cancelArticleJob(options.projectId.value, options.jobId.value);
      message("任务已取消", { type: "success" });
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : "取消失败", { type: "error" });
    } finally {
      options.cancelling.value = false;
    }
  }

  async function handleResume() {
    if (!options.canResume.value || options.resuming.value) return;
    options.resuming.value = true;
    try {
      await resumeArticleJob(options.projectId.value, options.jobId.value);
      message("任务已恢复，正在从断点继续执行…", { type: "success" });
      options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : "继续执行失败", { type: "error" });
    } finally {
      options.resuming.value = false;
    }
  }

  async function handleDelete() {
    if (!options.job.value || options.deleting.value) return;
    const confirmed = await confirmDeleteArticleJob(
      options.job.value.targetKeyword,
      isArticleJobInProgress(options.job.value.status)
    );
    if (!confirmed) return;

    options.deleting.value = true;
    try {
      await deleteArticleJob(options.projectId.value, options.jobId.value);
      message("任务已删除", { type: "success" });
      options.goBack();
    } finally {
      options.deleting.value = false;
    }
  }

  async function handleRerunOptimization(reason: "gsc_underperform" | "manual" = "manual") {
    if (!options.canRerunOptimization.value) return;
    options.rerunningOptimization.value = true;
    try {
      await rerunArticleOptimization(options.projectId.value, options.jobId.value, { reason });
      message("已重新入队优化评分，请稍候…", { type: "success" });
      options.goDetailTab("diagnose", "seo");
      options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : "重新优化失败", { type: "error" });
    } finally {
      options.rerunningOptimization.value = false;
    }
  }

  async function handleRerunParaphrase() {
    if (!options.canRerunParaphrase.value) return;
    options.rerunningParaphrase.value = true;
    try {
      await rerunArticleParaphrase(options.projectId.value, options.jobId.value);
      message(PARAPHRASE_RERUN_QUEUED, { type: "success" });
      options.goDetailTab("article");
      options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : PARAPHRASE_RERUN_FAILED, { type: "error" });
    } finally {
      options.rerunningParaphrase.value = false;
    }
  }

  async function handleRefreshSerp(payload?: { serpArticlesOnly?: boolean }) {
    if (!options.canRefreshSerp.value) return;
    options.serpRefreshing.value = true;
    try {
      await refreshArticleJobSerp(options.projectId.value, options.jobId.value, payload);
      message("已重新分析搜索结果，请稍候…", { type: "success" });
      options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      message(error instanceof Error ? error.message : "刷新失败", { type: "error" });
    } finally {
      options.serpRefreshing.value = false;
    }
  }

  return {
    handleRetry,
    handlePause,
    handleCancel,
    handleResume,
    handleDelete,
    handleRerunOptimization,
    handleRerunParaphrase,
    handleRefreshSerp
  };
}
