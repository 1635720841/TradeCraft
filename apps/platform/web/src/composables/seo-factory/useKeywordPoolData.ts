/**
 * 关键词池：筛选、分页、拉取、路由同步、专题列表。
 */

import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listKeywordClusters, type KeywordClusterItem } from "@/api/seo-factory/keyword-cluster";
import { listKeywords, type KeywordEntryItem } from "@/api/seo-factory/keyword";
import { runLoad } from "@/composables/run-load";

export type KeywordQuickFilter = "all" | "queueable" | "unclustered" | "gscVerified";

export function useKeywordPoolData(projectId: string) {
  const route = useRoute();
  const router = useRouter();

  const loading = ref(false);
  const error = ref<string | null>(null);
  const clustersError = ref<string | null>(null);
  const keywords = ref<KeywordEntryItem[]>([]);
  const page = ref(1);
  const limit = ref(20);
  const total = ref(0);
  const filterStatus = ref("");
  const filterIntent = ref("");
  const filterClusterId = ref("");
  const quickFilter = ref<KeywordQuickFilter>("queueable");
  const clusters = ref<KeywordClusterItem[]>([]);

  const activeFilterTitle = computed(() => {
    const parts: string[] = [];
    if (quickFilter.value === "queueable") parts.push("待写");
    if (quickFilter.value === "gscVerified") parts.push("本站有曝光");
    if (quickFilter.value === "unclustered") parts.push("未分组");
    if (filterClusterId.value) {
      const name = clusters.value.find((c) => c.id === filterClusterId.value)?.name;
      if (name) parts.push(`专题「${name}」`);
    }
    return parts.length ? `筛选：${parts.join(" · ")}` : "筛选中";
  });

  async function fetchKeywords() {
    await runLoad(
      async () => {
        const res = await listKeywords(projectId, page.value, limit.value, {
          status: quickFilter.value === "queueable" ? undefined : filterStatus.value || undefined,
          intent: filterIntent.value || undefined,
          clusterId: filterClusterId.value || undefined,
          unclustered: quickFilter.value === "unclustered",
          queueable: quickFilter.value === "queueable",
          gscVerified: quickFilter.value === "gscVerified",
          excludeArchived:
            quickFilter.value === "all" && !filterStatus.value ? undefined : false
        });
        return res;
      },
      {
        setLoading: (value) => {
          loading.value = value;
        },
        setError: (value) => {
          error.value = value;
        },
        onSuccess: (res) => {
          keywords.value = res.data ?? [];
          total.value = res.meta?.pagination?.total ?? keywords.value.length;
        },
        fallbackMessage: "关键词列表加载失败"
      }
    );
  }

  async function retryFetchKeywords() {
    await fetchKeywords();
  }

  function goUnclusteredFilter() {
    quickFilter.value = "unclustered";
    onQuickFilterChange();
  }

  function onQuickFilterChange() {
    if (quickFilter.value === "queueable") {
      filterStatus.value = "";
    }
    page.value = 1;
    syncFiltersToRoute();
    void fetchKeywords();
  }

  function onFilterChange() {
    page.value = 1;
    void fetchKeywords();
  }

  function syncFiltersToRoute() {
    const query: Record<string, string> = {};
    if (filterClusterId.value) query.clusterId = filterClusterId.value;
    if (quickFilter.value === "queueable") query.queueable = "1";
    if (quickFilter.value === "unclustered") query.unclustered = "1";
    if (quickFilter.value === "gscVerified") query.gscVerified = "1";
    router.replace({ name: "SeoFactoryKeywords", params: { projectId }, query });
  }

  function onClusterFilterChange() {
    page.value = 1;
    syncFiltersToRoute();
    void fetchKeywords();
  }

  function clearAllFilters() {
    quickFilter.value = "all";
    filterClusterId.value = "";
    filterStatus.value = "";
    filterIntent.value = "";
    page.value = 1;
    router.replace({ name: "SeoFactoryKeywords", params: { projectId } });
    void fetchKeywords();
  }

  function syncClusterFilterFromRoute() {
    const clusterId = route.query.clusterId;
    filterClusterId.value = typeof clusterId === "string" ? clusterId : "";
    if (filterClusterId.value) {
      quickFilter.value = "all";
    } else if (route.query.queueable === "1" || route.query.queueable === "true") {
      quickFilter.value = "queueable";
    } else if (route.query.unclustered === "1" || route.query.unclustered === "true") {
      quickFilter.value = "unclustered";
    } else if (route.query.gscVerified === "1" || route.query.gscVerified === "true") {
      quickFilter.value = "gscVerified";
    } else if (route.query.all === "1" || route.query.all === "true") {
      quickFilter.value = "all";
    } else {
      quickFilter.value = "queueable";
    }
  }

  function onSizeChange() {
    page.value = 1;
    void fetchKeywords();
  }

  async function loadClusters() {
    await runLoad(
      () => listKeywordClusters(projectId),
      {
        setLoading: () => {},
        setError: (value) => {
          clustersError.value = value;
        },
        onSuccess: (result) => {
          clusters.value = result;
        },
        showLoading: false,
        fallbackMessage: "专题列表加载失败"
      }
    );
  }

  async function retryLoadClusters() {
    await loadClusters();
  }

  watch(
    () => [route.query.clusterId, route.query.queueable, route.query.unclustered, route.query.gscVerified],
    () => {
      syncClusterFilterFromRoute();
      page.value = 1;
      void fetchKeywords();
    }
  );

  onMounted(() => {
    syncClusterFilterFromRoute();
    void loadClusters();
    void fetchKeywords();
  });

  return {
    loading,
    error,
    clustersError,
    keywords,
    page,
    limit,
    total,
    filterStatus,
    filterIntent,
    filterClusterId,
    quickFilter,
    clusters,
    activeFilterTitle,
    fetchKeywords,
    retryFetchKeywords,
    loadClusters,
    retryLoadClusters,
    goUnclusteredFilter,
    onQuickFilterChange,
    onFilterChange,
    onClusterFilterChange,
    clearAllFilters,
    onSizeChange
  };
}
