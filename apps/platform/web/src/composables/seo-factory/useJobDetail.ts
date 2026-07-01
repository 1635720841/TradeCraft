/**
 * 任务详情：加载任务、阶段状态、Tab 路由与活动流。
 */
import { computed, nextTick, onMounted, ref, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  listJobActivity,
  type JobActivityItem
} from "@/api/seo-factory/article-job-activity";
import { useArticleJobPolling } from "@/composables/seo-factory/useArticleJobPolling";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_PASS_THRESHOLD
} from "@/constants/seo-factory";
import { isBriefPending } from "@/utils/seo-factory/job-progress";
import type { DiagnoseSection } from "@/utils/seo-factory/job-detail-summary";
import { resolveEffectiveLocalSeoScore } from "@/utils/seo-factory/local-seo-display";
import { formatWorkflowProgressShort } from "@/utils/seo-factory/workflow-progress";
import type ArticleJobDiagnosePanel from "@/views/projects/seo-factory/components/ArticleJobDiagnosePanel.vue";

export function useJobDetail(options?: {
  isRewriting?: Ref<boolean>;
  isSemrushChecking?: Ref<boolean>;
  rerunningOptimization?: Ref<boolean>;
  rerunningParaphrase?: Ref<boolean>;
  serpRefreshing?: Ref<boolean>;
  retrying?: Ref<boolean>;
}) {
  const route = useRoute();
  const router = useRouter();

  const activeTab = ref<"article" | "diagnose" | "brief">("article");
  const activityItems = ref<JobActivityItem[]>([]);
  const semrushChecking = ref(false);
  const diagnosePanelRef = ref<InstanceType<
    typeof ArticleJobDiagnosePanel
  > | null>(null);

  const projectId = computed(() => route.params.projectId as string);
  const jobId = computed(() => route.params.jobId as string);

  const { can, canReview, canPublish } = useProjectSeoAccess();
  const canWriteJob = computed(() => can("seo:job:create"));
  const canReviewJob = computed(() => canReview());
  const canPublishJob = computed(() => canPublish());

  const { job, loading, polling, fetchOnce, startPolling } = useArticleJobPolling(
    projectId,
    jobId
  );

  function goDetailTab(
    tab: "article" | "diagnose" | "brief",
    section?: DiagnoseSection
  ) {
    activeTab.value = tab;
    if (tab === "diagnose" && section) {
      void nextTick(() => {
        void nextTick(() => {
          diagnosePanelRef.value?.scrollToLegacySection(section);
        });
      });
    }
  }

  function syncTabFromQuery(tab: unknown) {
    if (typeof tab !== "string" || !tab) return;
    if (tab === "draft" || tab === "article") {
      activeTab.value = "article";
      return;
    }
    if (tab === "brief") {
      activeTab.value = "brief";
      return;
    }
    const diagnoseSections: Record<string, DiagnoseSection> = {
      seo: "seo",
      ymyl: "ymyl",
      links: "links",
      images: "images",
      research: "research",
      more: "seo",
      diagnose: "seo"
    };
    const section = diagnoseSections[tab];
    if (section) goDetailTab("diagnose", section);
  }

  async function fetchActivity() {
    if (!projectId.value || !jobId.value) return;
    try {
      activityItems.value = await listJobActivity(projectId.value, jobId.value);
    } catch {
      activityItems.value = [];
    }
  }

  const hasDraftContent = computed(() => {
    const content = job.value?.draftData?.content;
    return Boolean(content && content.trim().length > 0);
  });

  const semrushPending = computed(
    () => job.value?.seoCheckData?.semrush?.pending ?? null
  );
  const rewritePending = computed(
    () => job.value?.draftData?.rewritePending ?? null
  );
  const rewriteCandidate = computed(
    () => job.value?.draftData?.rewriteCandidate ?? null
  );
  const draftStaleness = computed(() => job.value?.draftData?.staleness ?? null);
  const exportStale = computed(
    () => draftStaleness.value?.affected?.export === true
  );

  const draftEditHistory = computed(() =>
    [...(job.value?.draftData?.manualEditHistory ?? [])].reverse()
  );

  const isSemrushChecking = computed(
    () =>
      semrushChecking.value ||
      Boolean(semrushPending.value) ||
      job.value?.status === "OPTIMIZING"
  );

  const isRewriting = computed(
    () =>
      (options?.isRewriting?.value ?? false) || Boolean(rewritePending.value)
  );

  const workflowProgress = computed(
    () => job.value?.seoCheckData?.workflowProgress ?? null
  );

  const effectiveLocalSeoScore = computed(() =>
    resolveEffectiveLocalSeoScore(job.value)
  );

  const localPassThreshold = computed(
    () =>
      job.value?.siteWorkflow?.localPassThreshold ??
      job.value?.seoCheckData?.scoreThresholds?.localPassThreshold ??
      LOCAL_SEO_PASS_THRESHOLD
  );

  const semrushPassThreshold = computed(
    () =>
      job.value?.siteWorkflow?.semrushPassThreshold ??
      job.value?.seoCheckData?.scoreThresholds?.semrushPassThreshold ??
      SEMRUSH_PASS_THRESHOLD
  );

  const ymylReview = computed(() => job.value?.seoCheckData?.ymylReview ?? null);

  const requiresHumanReview = computed(
    () => ymylReview.value?.requires_human_review === true
  );

  const gscUnderperformHint = computed(
    () => route.query.gsc === "underperform" && job.value?.status === "COMPLETED"
  );

  const canRerunOptimization = computed(() => {
    if (!job.value || options?.rerunningOptimization?.value) return false;
    if (job.value.status !== "COMPLETED") return false;
    if (!hasDraftContent.value) return false;
    if (isSemrushChecking.value || isRewriting.value) return false;
    return true;
  });

  const canRerunParaphrase = computed(() => {
    if (!job.value || options?.rerunningParaphrase?.value) return false;
    if (job.value.status !== "COMPLETED") return false;
    if (!hasDraftContent.value) return false;
    if (
      isSemrushChecking.value ||
      isRewriting.value ||
      options?.rerunningOptimization?.value
    )
      return false;
    return true;
  });

  const canRefreshSerp = computed(() => {
    if (!job.value || options?.serpRefreshing?.value) return false;
    if (job.value.status === "QUEUED" || job.value.status === "RESEARCHING")
      return false;
    return true;
  });

  const optimizingProgressMessage = computed(() => {
    if (job.value?.status === "REVIEWING") return "YMYL 内容审查中…";
    if (job.value?.status === "LINKING")
      return "站内内链植入中（Semrush 终检前）…";
    if (job.value?.status === "ILLUSTRATING")
      return "正文配图补足中（Semrush 终检前）…";
    if (job.value?.status !== "OPTIMIZING") return "";
    const progressText = formatWorkflowProgressShort(workflowProgress.value);
    if (progressText) return progressText;
    if (semrushPending.value) return "Semrush 终检中（手动触发，约 2–5 分钟）…";
    return "工作流优化中（本地预检 + Semrush 终检，全程约 5–20 分钟）…";
  });

  const isOptimizingStale = computed(() => {
    if (job.value?.status !== "OPTIMIZING") return false;

    const pendingStarted = semrushPending.value?.startedAt;
    if (pendingStarted) {
      const started = Date.parse(pendingStarted);
      if (Number.isNaN(started)) return true;
      return Date.now() - started > 5 * 60 * 1000;
    }

    const touchAt = workflowProgress.value?.updatedAt ?? job.value?.updatedAt;
    if (!touchAt) return false;
    const touched = Date.parse(touchAt);
    if (Number.isNaN(touched)) return true;
    return Date.now() - touched > 8 * 60 * 1000;
  });

  const rewriteSuggestions = computed(() => {
    const local = job.value?.seoCheckData?.local?.suggestions ?? [];
    const semrush = job.value?.seoCheckData?.semrush?.suggestions ?? [];
    return [...new Set([...local, ...semrush].filter(Boolean))];
  });

  const rewriteBlockedReason = computed(() => {
    if (rewriteCandidate.value) return "请先采纳或放弃当前 AI 候选版本";
    if (isSemrushChecking.value) return "Semrush 检测进行中，请稍后再试";
    return "";
  });

  const canTriggerRewrite = computed(
    () =>
      hasDraftContent.value &&
      !rewriteCandidate.value &&
      !isRewriting.value &&
      !isSemrushChecking.value
  );

  const canRetry = computed(
    () =>
      canWriteJob.value &&
      job.value?.status === "FAILED" &&
      !options?.retrying?.value
  );

  const briefPending = computed(() =>
    job.value ? isBriefPending(job.value) : false
  );

  function calloutIcon(type: "success" | "warning" | "info" | "error") {
    const icons = {
      success: "ri:checkbox-circle-line",
      warning: "ri:alert-line",
      info: "ri:information-line",
      error: "ri:error-warning-line"
    };
    return icons[type];
  }

  function goBack() {
    router.push({
      name: "SeoFactoryJobs",
      params: { projectId: projectId.value }
    });
  }

  function goSiteManage() {
    router.push({
      name: "SeoFactorySites",
      params: { projectId: projectId.value }
    });
  }

  function handleChecklistGoTab(tab: "internalLinks" | "images") {
    goDetailTab("diagnose", tab === "internalLinks" ? "links" : "images");
  }

  watch(
    () => job.value?.briefData?.approvalStatus,
    status => {
      if (status === "pending") goDetailTab("brief");
    },
    { immediate: true }
  );

  watch(
    () => route.query,
    query => {
      syncTabFromQuery(query.tab);
    },
    { immediate: true }
  );

  function resolveDefaultTab(j: NonNullable<typeof job.value>) {
    if (isBriefPending(j)) return "brief" as const;
    if (j.draftData?.content?.trim()) return "article" as const;
    return "article" as const;
  }

  watch(
    () => job.value,
    (j, prev) => {
      if (!j || route.query.tab) return;
      // 仅首次加载任务数据时自动选 Tab；轮询刷新不应覆盖用户当前所在 Tab。
      if (prev != null) return;
      activeTab.value = resolveDefaultTab(j);
    },
    { immediate: true }
  );

  watch(
    () => [projectId.value, jobId.value] as const,
    () => void fetchActivity(),
    { immediate: true }
  );

  onMounted(() => {
    syncTabFromQuery(route.query.tab);
  });

  return {
    route,
    router,
    projectId,
    jobId,
    canWriteJob,
    canReviewJob,
    canPublishJob,
    job,
    loading,
    polling,
    fetchOnce,
    startPolling,
    activeTab,
    diagnosePanelRef,
    goDetailTab,
    syncTabFromQuery,
    activityItems,
    semrushChecking,
    hasDraftContent,
    semrushPending,
    rewritePending,
    rewriteCandidate,
    draftStaleness,
    exportStale,
    draftEditHistory,
    isSemrushChecking,
    isRewriting,
    workflowProgress,
    effectiveLocalSeoScore,
    localPassThreshold,
    semrushPassThreshold,
    ymylReview,
    requiresHumanReview,
    gscUnderperformHint,
    canRerunOptimization,
    canRerunParaphrase,
    canRefreshSerp,
    optimizingProgressMessage,
    isOptimizingStale,
    rewriteSuggestions,
    rewriteBlockedReason,
    canTriggerRewrite,
    canRetry,
    briefPending,
    calloutIcon,
    goBack,
    goSiteManage,
    handleChecklistGoTab
  };
}

export type UseJobDetailReturn = ReturnType<typeof useJobDetail>;
