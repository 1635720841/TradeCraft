import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import {
  useConsoleProjectScopeStoreHook,
  useConsoleProjectScopeStore
} from "@/store/modules/consoleProjectScope";

let routeWatchRegistered = false;

/** Console 跨页共享的企业 / 项目选择范围 */
export function useConsoleProjectScope() {
  const route = useRoute();
  const router = useRouter();
  const scopeStore = useConsoleProjectScopeStoreHook();
  const {
    tenantsLoading,
    projectsLoading,
    tenants,
    projects,
    organizationId,
    projectId,
    selectedTenant,
    selectedProject
  } = storeToRefs(scopeStore);

  function syncFromRoute() {
    const org = route.query.organizationId;
    const project = route.query.projectId;
    scopeStore.setOrganizationId(typeof org === "string" ? org : "");
    scopeStore.setProjectId(typeof project === "string" ? project : "");
  }

  function replaceScopeQuery(extra?: Record<string, string | undefined>) {
    const query: Record<string, string> = {};
    if (organizationId.value) query.organizationId = organizationId.value;
    if (projectId.value) query.projectId = projectId.value;
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) query[key] = value;
      }
    }
    void router.replace({ query });
  }

  async function loadTenants(keyword?: string) {
    await scopeStore.loadTenants(keyword);
  }

  async function loadProjects() {
    await scopeStore.loadProjects();
    if (!projectId.value && projects.value.length === 1) {
      scopeStore.setProjectId(projects.value[0].id);
      replaceScopeQuery();
    }
  }

  function onTenantChange() {
    scopeStore.setProjectId("");
    replaceScopeQuery();
    void loadProjects();
  }

  function onProjectChange() {
    replaceScopeQuery();
  }

  if (!routeWatchRegistered) {
    routeWatchRegistered = true;
    watch(
      () => [route.query.organizationId, route.query.projectId],
      async () => {
        syncFromRoute();
        if (organizationId.value) {
          await scopeStore.loadTenants();
          await loadProjects();
        } else {
          scopeStore.$patch({ projects: [], projectId: "" });
        }
      },
      { immediate: true }
    );
  }

  return {
    tenantsLoading,
    projectsLoading,
    tenants,
    projects,
    organizationId,
    projectId,
    selectedTenant,
    selectedProject,
    syncFromRoute,
    loadTenants,
    loadProjects,
    onTenantChange,
    onProjectChange,
    replaceScopeQuery
  };
}

export { useConsoleProjectScopeStore };
