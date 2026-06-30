import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listTenants, getTenant } from "@/api/console/tenants";
import type { TenantItem } from "@/api/console/types";
import { listTenantProjects, type ConsoleTenantProjectItem } from "@/api/console/projects";

/** 跨 ConsoleProjectScopeBar 与实验室/诊断页共享 */
const tenantsLoading = ref(false);
const projectsLoading = ref(false);
const tenants = ref<TenantItem[]>([]);
const projects = ref<ConsoleTenantProjectItem[]>([]);
const organizationId = ref("");
const projectId = ref("");

let routeWatchRegistered = false;

export function useConsoleProjectScope() {
  const route = useRoute();
  const router = useRouter();

  const selectedTenant = computed(
    () => tenants.value.find((item) => item.id === organizationId.value) ?? null
  );
  const selectedProject = computed(
    () => projects.value.find((item) => item.id === projectId.value) ?? null
  );

  function syncFromRoute() {
    const org = route.query.organizationId;
    const project = route.query.projectId;
    organizationId.value = typeof org === "string" ? org : "";
    projectId.value = typeof project === "string" ? project : "";
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

  async function ensureSelectedTenantInOptions() {
    const id = organizationId.value;
    if (!id || tenants.value.some((item) => item.id === id)) {
      return;
    }
    try {
      const detail = await getTenant(id);
      tenants.value = [detail, ...tenants.value];
    } catch {
      // 企业可能已删除或无权访问
    }
  }

  async function loadTenants(keyword?: string) {
    tenantsLoading.value = true;
    try {
      const result = await listTenants(1, 200, keyword);
      tenants.value = result.items;
      await ensureSelectedTenantInOptions();
    } finally {
      tenantsLoading.value = false;
    }
  }

  async function loadProjects() {
    if (!organizationId.value) {
      projects.value = [];
      projectId.value = "";
      return;
    }
    projectsLoading.value = true;
    try {
      projects.value = await listTenantProjects(organizationId.value);
      if (projectId.value && !projects.value.some((item) => item.id === projectId.value)) {
        projectId.value = "";
      }
      if (!projectId.value && projects.value.length === 1) {
        projectId.value = projects.value[0].id;
        replaceScopeQuery();
      }
    } finally {
      projectsLoading.value = false;
    }
  }

  function onTenantChange() {
    projectId.value = "";
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
          await ensureSelectedTenantInOptions();
          await loadProjects();
        } else {
          projects.value = [];
          projectId.value = "";
        }
      }
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
