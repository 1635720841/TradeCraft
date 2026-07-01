/**
 * 文章任务列表：筛选、拉取、轮询、路由同步、阶段提示、站点列表。
 */

import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listArticleJobs } from "@/api/seo-factory/article-job";
import { listSites } from "@/api/seo-factory/site";
import type { ArticleJobItem, SiteItem } from "@/api/seo-factory/types";
import { JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";

export type JobListStage =
  | "all"
  | "outlinePending"
  | "reviewPending"
  | "generating"
  | "failed"
  | "seoNotReady"
  | "publishPending"
  | "staleDraft"
  | "publishFailed";

export function useJobListQuery(projectId: string) {
  const route = useRoute();
  const router = useRouter();

  const loading = ref(false);
  const polling = ref(false);
  const jobs = ref<ArticleJobItem[]>([]);
  const page = ref(1);
  const limit = ref(20);
  const total = ref(0);

  const listFilter = ref<JobListStage>("all");
  const filterSiteId = ref("");
  const keywordSearch = ref("");
  const sites = ref<SiteItem[]>([]);
  const sitesLoading = ref(false);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keywordSearchTimer: ReturnType<typeof setTimeout> | null = null;

  const stageAlert = computed(() => {
    switch (listFilter.value) {
      case "outlinePending":
        return {
          type: "warning" as const,
          title: "仅显示待确认大纲的任务",
          description:
            "勾选多条后点「批量确认大纲」，或逐条「确认大纲」；也可进详情核对后再确认。"
        };
      case "reviewPending":
        return {
          type: "warning" as const,
          title: "仅显示敏感内容待审核的任务",
          description: "命中 YMYL 敏感主题需人工放行；可逐条「通过」或「驳回」，也可进详情查看全文。"
        };
      case "generating":
        return {
          type: "info" as const,
          title: "仅显示生成中的任务",
          description: "系统正在分析搜索结果并生成正文，列表会自动刷新。"
        };
      case "failed":
        return {
          type: "error" as const,
          title: "仅显示生成失败的任务",
          description: "可勾选后批量重试，或逐条点击「重新生成」。"
        };
      case "seoNotReady":
        return {
          type: "warning" as const,
          title: "仅显示 SEO 未达标的任务",
          description: "本地或 Semrush 分数未过线，建议进详情诊断并重新优化。"
        };
      case "publishPending":
        return {
          type: "info" as const,
          title: "仅显示待发布的任务",
          description: "文章已生成完成，可勾选后「批量推送 CMS」，或逐条点击推送。"
        };
      case "staleDraft":
        return {
          type: "warning" as const,
          title: "仅显示编辑后待处理的任务",
          description: "正文改过后需重新导出或推送 CMS，请进入任务详情按黄色提示操作。"
        };
      case "publishFailed":
        return {
          type: "error" as const,
          title: "仅显示发布失败的任务",
          description: ""
        };
      default:
        return null;
    }
  });

  const outlinePendingFilter = computed(() => listFilter.value === "outlinePending");
  const reviewPendingFilter = computed(() => listFilter.value === "reviewPending");
  const generatingFilter = computed(() => listFilter.value === "generating");
  const failedFilter = computed(() => listFilter.value === "failed");
  const seoNotReadyFilter = computed(() => listFilter.value === "seoNotReady");
  const publishPendingFilter = computed(() => listFilter.value === "publishPending");
  const staleDraftFilter = computed(() => listFilter.value === "staleDraft");
  const publishFailedFilter = computed(() => listFilter.value === "publishFailed");
  const assignedToMeFilter = computed(
    () => route.query.assignedToMe === "1" || route.query.assignedToMe === "true"
  );
  const siteOwnerMeFilter = computed(() => route.query.siteOwner === "me");

  const assignedToMeAlert = computed(() => null);

  const siteOwnerMeAlert = computed(() => null);

  const hasActiveJobs = computed(() =>
    jobs.value.some(
      (job) => !JOB_TERMINAL_STATUSES.includes(job.status as (typeof JOB_TERMINAL_STATUSES)[number])
    )
  );

  function syncKeywordFromRoute() {
    const kw = route.query.keyword;
    keywordSearch.value = typeof kw === "string" ? kw : "";
  }

  function onKeywordSearchInput() {
    if (keywordSearchTimer) clearTimeout(keywordSearchTimer);
    keywordSearchTimer = setTimeout(() => {
      const query = { ...route.query };
      const trimmed = keywordSearch.value.trim();
      if (trimmed) query.keyword = trimmed;
      else delete query.keyword;
      router.replace({ name: "SeoFactoryJobs", params: { projectId }, query });
    }, 300);
  }

  function onKeywordSearchClear() {
    keywordSearch.value = "";
    onKeywordSearchInput();
  }

  async function fetchJobs(showLoading = true) {
    if (showLoading) loading.value = true;
    try {
      const res = await listArticleJobs(projectId, page.value, limit.value, {
        briefPending: outlinePendingFilter.value,
        reviewPending: reviewPendingFilter.value,
        generating: generatingFilter.value,
        cmsPublishFailed: publishFailedFilter.value,
        cmsPublishPending: publishPendingFilter.value,
        seoNotReady: seoNotReadyFilter.value,
        staleDraft: staleDraftFilter.value,
        assignedToMe: assignedToMeFilter.value,
        siteOwner: siteOwnerMeFilter.value ? "me" : undefined,
        status: failedFilter.value ? "FAILED" : undefined,
        siteId: filterSiteId.value || undefined,
        keyword: keywordSearch.value.trim() || undefined
      });
      jobs.value = res.data ?? [];
      total.value = res.meta?.pagination?.total ?? jobs.value.length;
    } finally {
      if (showLoading) loading.value = false;
      syncPolling();
    }
  }

  function syncPolling() {
    if (hasActiveJobs.value) {
      startPolling();
    } else {
      stopPolling();
    }
  }

  function startPolling() {
    stopPolling();
    if (document.hidden) return;
    polling.value = true;
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      if (hasActiveJobs.value) {
        void fetchJobs(false);
      }
    }, 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    polling.value = false;
  }

  function onSizeChange() {
    page.value = 1;
    void fetchJobs();
  }

  function buildJobsQuery(extra: Record<string, string> = {}) {
    const query: Record<string, string> = { ...extra };
    if (filterSiteId.value) query.siteId = filterSiteId.value;
    if (assignedToMeFilter.value) query.assignedToMe = "1";
    if (siteOwnerMeFilter.value) query.siteOwner = "me";
    return query;
  }

  function stageQueryValue(stage: JobListStage): string | undefined {
    if (stage === "all") return undefined;
    return stage;
  }

  function clearListFilter() {
    listFilter.value = "all";
    router.replace({
      name: "SeoFactoryJobs",
      params: { projectId },
      query: buildJobsQuery()
    });
  }

  function toggleSiteOwnerFilter(checked: boolean | string | number) {
    page.value = 1;
    const query = buildJobsQuery();
    if (checked) query.siteOwner = "me";
    else delete query.siteOwner;
    const stage = stageQueryValue(listFilter.value);
    if (stage) query.stage = stage;
    router.replace({ name: "SeoFactoryJobs", params: { projectId }, query });
  }

  function onSiteFilterChange() {
    page.value = 1;
    const query = buildJobsQuery();
    const stage = stageQueryValue(listFilter.value);
    if (stage) query.stage = stage;
    router.replace({ name: "SeoFactoryJobs", params: { projectId }, query });
  }

  function onListFilterChange(value: JobListStage) {
    page.value = 1;
    const stage = stageQueryValue(value);
    router.replace({
      name: "SeoFactoryJobs",
      params: { projectId },
      query: stage ? buildJobsQuery({ stage }) : buildJobsQuery()
    });
  }

  function resolveStageFromRoute(): JobListStage {
    const stage = route.query.stage;
    if (typeof stage === "string") {
      const allowed: JobListStage[] = [
        "outlinePending",
        "reviewPending",
        "generating",
        "failed",
        "seoNotReady",
        "publishPending",
        "staleDraft",
        "publishFailed"
      ];
      if (allowed.includes(stage as JobListStage)) return stage as JobListStage;
      if (stage === "briefPending") return "outlinePending";
      if (stage === "cmsPublishPending") return "publishPending";
      if (stage === "cmsPublishFailed") return "publishFailed";
      if (stage === "reviewPending") return "reviewPending";
    }
    if (route.query.briefPending === "1" || route.query.briefPending === "true") {
      return "outlinePending";
    }
    if (route.query.status === "FAILED") return "failed";
    if (route.query.cmsPublishPending === "1" || route.query.cmsPublishPending === "true") {
      return "publishPending";
    }
    if (route.query.staleDraft === "1" || route.query.staleDraft === "true") {
      return "staleDraft";
    }
    if (route.query.seoNotReady === "1" || route.query.seoNotReady === "true") {
      return "seoNotReady";
    }
    if (route.query.cmsPublishFailed === "1" || route.query.cmsPublishFailed === "true") {
      return "publishFailed";
    }
    return "all";
  }

  function syncListFilterFromRoute() {
    const siteId = route.query.siteId;
    filterSiteId.value = typeof siteId === "string" ? siteId : "";
    listFilter.value = resolveStageFromRoute();
  }

  async function loadSites() {
    sitesLoading.value = true;
    try {
      sites.value = await listSites(projectId);
    } finally {
      sitesLoading.value = false;
    }
  }

  watch(
    () => [
      route.query.stage,
      route.query.siteId,
      route.query.assignedToMe,
      route.query.siteOwner,
      route.query.keyword
    ],
    () => {
      syncListFilterFromRoute();
      syncKeywordFromRoute();
      page.value = 1;
      void fetchJobs();
    }
  );

  function onVisibilityChange() {
    if (document.hidden) {
      stopPolling();
      return;
    }
    syncPolling();
  }

  onMounted(() => {
    syncListFilterFromRoute();
    syncKeywordFromRoute();
    document.addEventListener("visibilitychange", onVisibilityChange);
    void loadSites();
    void fetchJobs();
  });

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    stopPolling();
  });

  return {
    loading,
    polling,
    jobs,
    page,
    limit,
    total,
    listFilter,
    filterSiteId,
    keywordSearch,
    sites,
    sitesLoading,
    stageAlert,
    assignedToMeAlert,
    siteOwnerMeAlert,
    siteOwnerMeFilter,
    fetchJobs,
    startPolling,
    stopPolling,
    onSizeChange,
    onKeywordSearchInput,
    onKeywordSearchClear,
    clearListFilter,
    toggleSiteOwnerFilter,
    onSiteFilterChange,
    onListFilterChange
  };
}
