/**
 * 任务详情稿件：保存、回滚、陈旧态处理与编辑模式切换。
 */
import { computed, onMounted, ref, watch, type MaybeRefOrGetter, toValue } from "vue";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import {
  patchArticleDraft,
  resolveArticleDraftStale,
  rollbackArticleDraft
} from "@/api/seo-factory/article-job";
import type {
  ArticleJobItem,
  ArticleJobYmylReview,
  DraftPostSaveAction,
  DraftResolveStaleAction,
  DraftStaleness,
  DraftStalenessAffected,
  ManualEditHistoryEntry
} from "@/api/seo-factory/types";
import {
  previewPendingEditAffected,
  buildPublishChecklist,
  needsSaveConfirmDialog,
  resolveQuickSaveAction
} from "@/utils/seo-factory/draft-edit-preview";
import { ElMessageBox } from "element-plus";
import { message } from "@/utils/message";
import type ArticleJobDraftEditor from "@/views/projects/seo-factory/components/ArticleJobDraftEditor.vue";

export function useJobDraftActions(options: {
  route: RouteLocationNormalizedLoaded;
  projectId: MaybeRefOrGetter<string>;
  jobId: MaybeRefOrGetter<string>;
  job: MaybeRefOrGetter<ArticleJobItem | null | undefined>;
  fetchOnce: () => void | Promise<void>;
  startPolling: () => void;
  hasDraftContent: MaybeRefOrGetter<boolean>;
  ymylReview: MaybeRefOrGetter<ArticleJobYmylReview | null | undefined>;
  requiresHumanReview: MaybeRefOrGetter<boolean>;
  canWriteJob: MaybeRefOrGetter<boolean>;
  rewriteCandidate: MaybeRefOrGetter<unknown>;
  isRewriting: MaybeRefOrGetter<boolean>;
  isSemrushChecking: MaybeRefOrGetter<boolean>;
  draftStaleness: MaybeRefOrGetter<DraftStaleness | null | undefined>;
  effectiveLocalSeoScore: MaybeRefOrGetter<number | null | undefined>;
}) {
  const draftViewMode = ref<"preview" | "edit">("preview");
  const draftViewOptions = [
    { label: "预览", value: "preview" },
    { label: "编辑", value: "edit" }
  ];
  const draftEditorRef = ref<InstanceType<typeof ArticleJobDraftEditor> | null>(
    null
  );
  const draftSaving = ref(false);
  const draftSaveDialogOpen = ref(false);
  const draftSaveSummary = ref("");
  const pendingEditAffected = ref<DraftStalenessAffected | null>(null);
  const draftRollingBackId = ref<string | null>(null);
  const rollbackDialogOpen = ref(false);
  const rollbackTarget = ref<ManualEditHistoryEntry | null>(null);
  const draftResolving = ref<DraftResolveStaleAction | null>(null);
  const versionConflictOpen = ref(false);
  const pendingSaveAction = ref<DraftPostSaveAction>("refresh_local");
  const pendingGoPreview = ref(false);

  const draftViewModeProxy = computed({
    get: () => draftViewMode.value,
    set: (value: "preview" | "edit") => {
      void switchDraftViewMode(value);
    }
  });

  const draftEditBlockedReason = computed(() => {
    if (toValue(options.rewriteCandidate)) return "请先采纳或放弃 AI 候选版本";
    if (toValue(options.isRewriting)) return "AI 重写进行中";
    if (toValue(options.isSemrushChecking)) return "Semrush 检测进行中";
    return "";
  });

  const canSaveDraftEdit = computed(
    () =>
      toValue(options.canWriteJob) &&
      toValue(options.hasDraftContent) &&
      !draftEditBlockedReason.value &&
      !draftSaving.value
  );

  const publishChecklistItems = computed(() =>
    buildPublishChecklist({
      staleness: toValue(options.draftStaleness),
      localSeoScore: toValue(options.effectiveLocalSeoScore),
      outputUrl: toValue(options.job)?.outputUrl,
      ymylReview: toValue(options.ymylReview),
      semrushRunning: toValue(options.isSemrushChecking),
      resolvingAction: draftResolving.value,
      contentScore: toValue(options.job)?.seoCheckData?.contentScore,
      draftContent: toValue(options.job)?.draftData?.content ?? "",
      reduceRpaEnabled:
        toValue(options.job)?.seoCheckData?.calibration?.reduceRpaEnabled ===
        true
    })
  );

  const pendingYmylReReview = computed(() => {
    if (!toValue(options.requiresHumanReview)) return false;
    if (toValue(options.ymylReview)?.humanReviewStatus !== "approved")
      return false;
    return pendingEditAffected.value?.ymyl === true;
  });

  watch(draftViewMode, mode => {
    if (mode === "edit" && draftEditBlockedReason.value) {
      draftViewMode.value = "preview";
      message(draftEditBlockedReason.value, { type: "warning" });
    }
  });

  watch(
    () => options.route.query,
    query => {
      if (query.edit === "1" && toValue(options.hasDraftContent))
        draftViewMode.value = "edit";
    },
    { immediate: true }
  );

  onMounted(() => {
    if (options.route.query.edit === "1" && toValue(options.hasDraftContent))
      draftViewMode.value = "edit";
  });

  async function switchDraftViewMode(next: "preview" | "edit") {
    if (next === draftViewMode.value) return;

    if (draftViewMode.value === "edit" && next === "preview") {
      const editor = draftEditorRef.value;
      if (editor?.isDirty) {
        try {
          await ElMessageBox.confirm(
            "有未保存的修改，确定离开编辑模式？",
            "未保存修改",
            {
              type: "warning",
              confirmButtonText: "离开",
              cancelButtonText: "继续编辑"
            }
          );
        } catch {
          return;
        }
      }
    }

    if (next === "edit" && draftEditBlockedReason.value) {
      message(draftEditBlockedReason.value, { type: "warning" });
      return;
    }

    draftViewMode.value = next;
  }

  function extractApiErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object") return undefined;
    const response = (
      error as { response?: { data?: { error?: { code?: string } } } }
    ).response;
    return response?.data?.error?.code;
  }

  function openDraftSaveDialog(goPreview = false) {
    pendingGoPreview.value = goPreview;
    const editor = draftEditorRef.value;
    const job = toValue(options.job);
    if (!editor || !job?.draftData) return;

    const payload = editor.getPayload();
    const before = job.draftData;
    const affected = previewPendingEditAffected(before, payload);
    if (!affected) {
      message("内容无变更", { type: "warning" });
      return;
    }

    const parts: string[] = [];
    if (affected.export) parts.push("导出物");
    if (affected.localSeo) parts.push("本地 SEO 分");
    draftSaveSummary.value = `将保存对${parts.length ? parts.join("、") : "稿件"}的修改。`;
    pendingEditAffected.value = affected;
    draftSaveDialogOpen.value = true;
  }

  function handleQuickSave() {
    void runDraftSave({ goPreview: false, forceDialog: false });
  }

  function handleSaveAndPreview() {
    void runDraftSave({ goPreview: true, forceDialog: false });
  }

  async function runDraftSave(saveOptions: {
    goPreview: boolean;
    forceDialog: boolean;
  }) {
    const editor = draftEditorRef.value;
    const job = toValue(options.job);
    if (!editor || !job?.draftData) return;

    const payload = editor.getPayload();
    const before = job.draftData;
    const affected = previewPendingEditAffected(before, payload);
    if (!affected) {
      message("内容无变更", { type: "warning" });
      return;
    }

    const ymylWasApproved =
      toValue(options.ymylReview)?.humanReviewStatus === "approved";
    if (
      saveOptions.forceDialog ||
      needsSaveConfirmDialog(before, payload, { ymylWasApproved })
    ) {
      pendingGoPreview.value = saveOptions.goPreview;
      openDraftSaveDialog();
      return;
    }

    await submitDraftSave(resolveQuickSaveAction(affected), {
      goPreview: saveOptions.goPreview
    });
  }

  async function submitDraftSave(
    postSaveAction: DraftPostSaveAction,
    saveOptions?: { goPreview?: boolean }
  ) {
    const editor = draftEditorRef.value;
    const job = toValue(options.job);
    if (!editor || !job?.draftData || draftSaving.value) return;

    const payload = editor.getPayload();
    draftSaving.value = true;
    try {
      await patchArticleDraft(toValue(options.projectId), toValue(options.jobId), {
        ...payload,
        contentVersion: job.draftData.contentVersion ?? 0,
        postSaveAction
      });
      draftSaveDialogOpen.value = false;
      editor.markSaved();
      if (saveOptions?.goPreview) {
        await switchDraftViewMode("preview");
      }
      message(
        postSaveAction === "rerun_from_optimizing"
          ? "已保存，正在重算 SEO / Semrush…"
          : postSaveAction === "refresh_local"
            ? "已保存，正在重算本地 SEO…"
            : "稿件已保存",
        { type: "success" }
      );
      if (postSaveAction === "rerun_from_optimizing") options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      if (extractApiErrorCode(error) === "DRAFT_VERSION_CONFLICT") {
        pendingSaveAction.value = postSaveAction;
        pendingGoPreview.value = saveOptions?.goPreview ?? false;
        versionConflictOpen.value = true;
        return;
      }
      const msg = error instanceof Error ? error.message : "保存失败";
      message(msg, { type: "error" });
    } finally {
      draftSaving.value = false;
    }
  }

  async function handleVersionConflictRetry() {
    versionConflictOpen.value = false;
    await options.fetchOnce();
    await submitDraftSave(pendingSaveAction.value, {
      goPreview: pendingGoPreview.value
    });
  }

  async function handleConfirmDraftSave(postSaveAction: DraftPostSaveAction) {
    pendingSaveAction.value = postSaveAction;
    await submitDraftSave(postSaveAction, { goPreview: pendingGoPreview.value });
  }

  async function handleResolveDraftStale(action: DraftResolveStaleAction) {
    if (draftResolving.value) return;

    draftResolving.value = action;
    try {
      await resolveArticleDraftStale(
        toValue(options.projectId),
        toValue(options.jobId),
        action
      );
      const labels: Record<DraftResolveStaleAction, string> = {
        refresh_local: "本地 SEO 已重算",
        rerun_semrush: "Semrush 终检已启动",
        regenerate_export: "导出物已重新生成"
      };
      message(labels[action], { type: "success" });
      if (action === "rerun_semrush") options.startPolling();
      await options.fetchOnce();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作失败";
      message(msg, { type: "error" });
    } finally {
      draftResolving.value = null;
    }
  }

  function handleChecklistAction(action: DraftResolveStaleAction) {
    void handleResolveDraftStale(action);
  }

  function handleDraftRollback(historyId: string) {
    if (draftRollingBackId.value || draftSaving.value) return;

    const entry = toValue(options.job)?.draftData?.manualEditHistory?.find(
      item => item.id === historyId
    );
    if (!entry) return;

    rollbackTarget.value = entry;
    rollbackDialogOpen.value = true;
  }

  async function submitRollback() {
    if (!rollbackTarget.value || draftRollingBackId.value) return;

    const historyId = rollbackTarget.value.id;
    draftRollingBackId.value = historyId;
    try {
      await rollbackArticleDraft(
        toValue(options.projectId),
        toValue(options.jobId),
        historyId,
        "refresh_local"
      );
      rollbackDialogOpen.value = false;
      rollbackTarget.value = null;
      message("已回滚至历史版本", { type: "success" });
      await switchDraftViewMode("preview");
      await options.fetchOnce();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "回滚失败";
      message(msg, { type: "error" });
    } finally {
      draftRollingBackId.value = null;
    }
  }

  return {
    draftViewMode,
    draftViewOptions,
    draftViewModeProxy,
    draftEditorRef,
    draftSaving,
    draftSaveDialogOpen,
    draftSaveSummary,
    pendingEditAffected,
    draftRollingBackId,
    rollbackDialogOpen,
    rollbackTarget,
    draftResolving,
    versionConflictOpen,
    pendingSaveAction,
    pendingGoPreview,
    draftEditBlockedReason,
    canSaveDraftEdit,
    publishChecklistItems,
    pendingYmylReReview,
    switchDraftViewMode,
    openDraftSaveDialog,
    handleQuickSave,
    handleSaveAndPreview,
    handleVersionConflictRetry,
    handleConfirmDraftSave,
    handleResolveDraftStale,
    handleChecklistAction,
    handleDraftRollback,
    submitRollback
  };
}
