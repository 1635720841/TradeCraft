import { computed, ref, watch, type MaybeRefOrGetter, toValue } from "vue";
import { listConsoleSiteOverview, type ConsoleSiteOverviewRow } from "@/api/console/sites";

export function useConsoleSiteOverview(scope?: {
  organizationId?: MaybeRefOrGetter<string | undefined>;
  projectId?: MaybeRefOrGetter<string | undefined>;
}) {
  const loading = ref(false);
  const sites = ref<ConsoleSiteOverviewRow[]>([]);
  const keyword = ref("");
  const profileReadyFilter = ref<"" | "true" | "false">("");
  const gscConnectedFilter = ref<"" | "true" | "false">("");
  const page = ref(1);
  const limit = ref(20);
  const total = ref(0);

  const stats = computed(() => ({
    profileMissing: sites.value.filter((row) => !row.profileReady).length,
    gscIssue: sites.value.filter(
      (row) =>
        row.gscEnabled &&
        (row.gsc.status === "unbound" ||
          row.gsc.status === "error" ||
          row.gsc.status === "stale" ||
          row.gsc.status === "pending_sync")
    ).length
  }));

  async function loadSites() {
    loading.value = true;
    try {
      const organizationId = toValue(scope?.organizationId);
      const projectId = toValue(scope?.projectId);
      const result = await listConsoleSiteOverview({
        page: page.value,
        limit: limit.value,
        keyword: keyword.value.trim() || undefined,
        organizationId: organizationId || undefined,
        projectId: projectId || undefined,
        profileReady: profileReadyFilter.value || undefined,
        gscConnected: gscConnectedFilter.value || undefined
      });
      sites.value = result.items;
      total.value = result.total;
    } finally {
      loading.value = false;
    }
  }

  function searchSites() {
    page.value = 1;
    void loadSites();
  }

  if (scope?.organizationId || scope?.projectId) {
    watch(
      () => [toValue(scope.organizationId), toValue(scope.projectId)],
      () => {
        page.value = 1;
        void loadSites();
      }
    );
  }

  return {
    loading,
    sites,
    keyword,
    profileReadyFilter,
    gscConnectedFilter,
    page,
    limit,
    total,
    stats,
    loadSites,
    searchSites
  };
}
