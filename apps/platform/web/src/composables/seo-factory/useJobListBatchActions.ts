/**
 * 文章任务列表：批量操作、行操作、审核弹窗状态。
 */

import { computed, ref, type Ref } from "vue";
import { ElMessageBox } from "element-plus";
import {
  approveArticleBrief,
  approveArticleReview,
  batchApproveArticleBriefs,
  batchDeleteArticleJobs,
  batchExportArticleJobs,
  batchPublishArticleJobs,
  batchRetryArticleJobs,
  deleteArticleJob,
  publishArticleJob,
  rejectArticleReview,
  retryArticleJob
} from "@/api/seo-factory/article-job";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import {
  confirmDeleteArticleJob,
  isArticleJobInProgress
} from "@/utils/seo-factory/job-delete-confirm";
import { message } from "@/utils/message";
import { canPublishJobToCms } from "@/utils/seo-factory/cms-publish-status";
import { isBriefPending } from "@/utils/seo-factory/job-progress";
import { isJobReleaseReady } from "@/utils/seo-factory/release-readiness";

export function useJobListBatchActions(options: {
  projectId: string;
  jobs: Ref<ArticleJobItem[]>;
  clearSelection: () => void;
  fetchJobs: (showLoading?: boolean) => Promise<void>;
  startPolling: () => void;
}) {
  const { projectId, jobs, clearSelection, fetchJobs, startPolling } = options;

  const selectedJobs = ref<ArticleJobItem[]>([]);
  const retryingId = ref<string | null>(null);
  const publishingId = ref<string | null>(null);
  const batchRetrying = ref(false);
  const batchBriefApproving = ref(false);
  const batchPublishing = ref(false);
  const batchExporting = ref(false);
  const batchDeleting = ref(false);
  const deletingId = ref<string | null>(null);
  const approvingBriefId = ref<string | null>(null);
  const reviewDialogVisible = ref(false);
  const reviewDialogAction = ref<"approve" | "reject">("approve");
  const reviewJobId = ref("");
  const reviewNote = ref("");
  const actingReviewId = ref<string | null>(null);
  const actingReviewType = ref<"approve" | "reject" | null>(null);

  const reviewDialogTitle = computed(() =>
    reviewDialogAction.value === "approve" ? "通过审核" : "驳回审核"
  );

  const retryableSelected = computed(() =>
    selectedJobs.value.filter((job) => job.status === "FAILED")
  );

  const briefApprovableSelected = computed(() =>
    selectedJobs.value.filter((job) => isBriefPending(job))
  );

  const publishableSelected = computed(() =>
    selectedJobs.value.filter((job) => canPublishJobToCms(job) && isJobReleaseReady(job))
  );

  const exportableSelected = computed(() =>
    selectedJobs.value.filter((job) => job.exportReady === true)
  );

  function handleSelectionChange(rows: ArticleJobItem[]) {
    selectedJobs.value = rows;
  }

  function openReviewDialog(jobId: string, action: "approve" | "reject") {
    reviewJobId.value = jobId;
    reviewDialogAction.value = action;
    reviewNote.value = "";
    reviewDialogVisible.value = true;
  }

  async function handleBriefApprove(jobId: string) {
    approvingBriefId.value = jobId;
    try {
      await approveArticleBrief(projectId, jobId);
      message("大纲已确认，正在生成正文…", { type: "success" });
      await fetchJobs(false);
      startPolling();
    } catch (error) {
      message(error instanceof Error ? error.message : "确认失败", { type: "error" });
    } finally {
      approvingBriefId.value = null;
    }
  }

  async function handleBatchBriefApprove() {
    if (briefApprovableSelected.value.length === 0) return;
    batchBriefApproving.value = true;
    try {
      const jobIds = briefApprovableSelected.value.map((job) => job.id);
      const result = await batchApproveArticleBriefs(projectId, jobIds);
      message(
        `已确认 ${result.approved} 篇${result.failed ? `，${result.failed} 篇失败` : ""}，正在生成正文…`,
        { type: result.approved > 0 ? "success" : "warning" }
      );
      if (result.failed > 0) {
        const keywordById = new Map(
          briefApprovableSelected.value.map((job) => [job.id, job.targetKeyword])
        );
        const detail = result.results
          .filter((item) => !item.ok)
          .map((item) => `• ${keywordById.get(item.jobId) ?? item.jobId}：${item.error ?? "失败"}`)
          .join("\n");
        await ElMessageBox.alert(detail, `${result.failed} 篇确认失败`, {
          type: "warning",
          confirmButtonText: "知道了"
        });
      }
      clearSelection();
      await fetchJobs(false);
      if (result.approved > 0) startPolling();
    } finally {
      batchBriefApproving.value = false;
    }
  }

  async function submitReview() {
    actingReviewId.value = reviewJobId.value;
    actingReviewType.value = reviewDialogAction.value;
    try {
      const note = reviewNote.value.trim() || undefined;
      if (reviewDialogAction.value === "approve") {
        await approveArticleReview(projectId, reviewJobId.value, note);
        message("已通过审核，HTML 导出已生成", { type: "success" });
      } else {
        await rejectArticleReview(projectId, reviewJobId.value, note);
        message("已驳回审核", { type: "warning" });
      }
      reviewDialogVisible.value = false;
      await fetchJobs(false);
    } catch (error) {
      message(error instanceof Error ? error.message : "审核失败", { type: "error" });
    } finally {
      actingReviewId.value = null;
      actingReviewType.value = null;
    }
  }

  async function handleRetry(jobId: string) {
    retryingId.value = jobId;
    try {
      await retryArticleJob(projectId, jobId);
      message("已从失败步骤重新入队，正在重新生成…", { type: "success" });
      await fetchJobs(false);
      startPolling();
    } finally {
      retryingId.value = null;
    }
  }

  async function handlePublish(jobId: string) {
    publishingId.value = jobId;
    try {
      await publishArticleJob(projectId, jobId);
      message("已推送到 CMS 草稿", { type: "success" });
      await fetchJobs(false);
    } catch (error) {
      message(error instanceof Error ? error.message : "推送失败", { type: "error" });
    } finally {
      publishingId.value = null;
    }
  }

  async function handleBatchRetry() {
    if (retryableSelected.value.length === 0) return;
    batchRetrying.value = true;
    try {
      const result = await batchRetryArticleJobs(
        projectId,
        retryableSelected.value.map((job) => job.id)
      );
      message(`已重试 ${result.retried} 个任务${result.failed ? `，${result.failed} 个跳过` : ""}`, {
        type: result.retried > 0 ? "success" : "warning"
      });
      clearSelection();
      await fetchJobs(false);
      startPolling();
    } finally {
      batchRetrying.value = false;
    }
  }

  async function handleBatchExport() {
    if (exportableSelected.value.length === 0) return;
    batchExporting.value = true;
    try {
      const { blob, meta } = await batchExportArticleJobs(
        projectId,
        exportableSelected.value.map((job) => job.id)
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `batch-export-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      message(
        `已导出 ${meta.exported} 篇${meta.failed ? `，${meta.failed} 篇跳过` : ""}`,
        { type: meta.exported > 0 ? "success" : "warning" }
      );
      if (meta.failed > 0 && meta.failures.length > 0) {
        const detail = meta.failures
          .map((item) => `• ${item.targetKeyword}：${item.error}`)
          .join("\n");
        await ElMessageBox.alert(detail, `${meta.failed} 篇导出失败`, {
          type: "warning",
          confirmButtonText: "知道了"
        });
      }
      clearSelection();
    } catch (error) {
      message(error instanceof Error ? error.message : "批量导出失败", { type: "error" });
    } finally {
      batchExporting.value = false;
    }
  }

  async function handleDelete(jobId: string, targetKeyword: string) {
    const row = jobs.value.find((item) => item.id === jobId);
    const confirmed = await confirmDeleteArticleJob(
      targetKeyword,
      row ? isArticleJobInProgress(row.status) : false
    );
    if (!confirmed) return;

    deletingId.value = jobId;
    try {
      await deleteArticleJob(projectId, jobId);
      message("任务已删除", { type: "success" });
      await fetchJobs(false);
    } finally {
      deletingId.value = null;
    }
  }

  async function handleBatchDelete() {
    if (selectedJobs.value.length === 0) return;

    const inProgressCount = selectedJobs.value.filter((job) =>
      isArticleJobInProgress(job.status)
    ).length;
    const keywordPreview = selectedJobs.value
      .slice(0, 3)
      .map((job) => job.targetKeyword)
      .join("、");
    const suffix = selectedJobs.value.length > 3 ? ` 等 ${selectedJobs.value.length} 项` : "";
    let messageText = `确定删除 ${selectedJobs.value.length} 个任务（${keywordPreview}${suffix}）？删除后不可恢复。`;
    if (inProgressCount > 0) {
      messageText += `\n\n其中 ${inProgressCount} 个仍在进行中。`;
    }

    try {
      await ElMessageBox.confirm(messageText, "批量删除任务", {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        confirmButtonClass: "el-button--danger"
      });
    } catch {
      return;
    }

    batchDeleting.value = true;
    try {
      const result = await batchDeleteArticleJobs(
        projectId,
        selectedJobs.value.map((job) => job.id)
      );
      message(`已删除 ${result.deleted} 个任务${result.failed ? `，${result.failed} 个失败` : ""}`, {
        type: result.deleted > 0 ? "success" : "warning"
      });
      clearSelection();
      await fetchJobs(false);
    } finally {
      batchDeleting.value = false;
    }
  }

  async function handleBatchPublish() {
    if (publishableSelected.value.length === 0) return;
    batchPublishing.value = true;
    try {
      const result = await batchPublishArticleJobs(
        projectId,
        publishableSelected.value.map((job) => job.id)
      );
      message(
        `已推送 ${result.published} 篇${result.failed ? `，${result.failed} 篇失败` : ""}`,
        { type: result.published > 0 ? "success" : "warning" }
      );
      clearSelection();
      await fetchJobs(false);
    } finally {
      batchPublishing.value = false;
    }
  }

  return {
    selectedJobs,
    retryingId,
    publishingId,
    batchRetrying,
    batchBriefApproving,
    batchPublishing,
    batchExporting,
    batchDeleting,
    deletingId,
    approvingBriefId,
    reviewDialogVisible,
    reviewDialogAction,
    reviewJobId,
    reviewNote,
    actingReviewId,
    actingReviewType,
    reviewDialogTitle,
    retryableSelected,
    briefApprovableSelected,
    publishableSelected,
    exportableSelected,
    handleSelectionChange,
    openReviewDialog,
    handleBriefApprove,
    handleBatchBriefApprove,
    submitReview,
    handleRetry,
    handlePublish,
    handleBatchRetry,
    handleBatchExport,
    handleDelete,
    handleBatchDelete,
    handleBatchPublish
  };
}
