import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { listTenants, getTenant } from "@/api/console/tenants";
import type { TenantItem } from "@/api/console/types";
import { listTenantProjects, type ConsoleTenantProjectItem } from "@/api/console/projects";
import { store } from "../utils";

export const useConsoleProjectScopeStore = defineStore("console-project-scope", () => {
  const tenantsLoading = ref(false);
  const projectsLoading = ref(false);
  const tenants = ref<TenantItem[]>([]);
  const projects = ref<ConsoleTenantProjectItem[]>([]);
  const organizationId = ref("");
  const projectId = ref("");

  const selectedTenant = computed(
    () => tenants.value.find((item) => item.id === organizationId.value) ?? null
  );
  const selectedProject = computed(
    () => projects.value.find((item) => item.id === projectId.value) ?? null
  );

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
      }
    } finally {
      projectsLoading.value = false;
    }
  }

  function setOrganizationId(id: string) {
    organizationId.value = id;
  }

  function setProjectId(id: string) {
    projectId.value = id;
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
    loadTenants,
    loadProjects,
    setOrganizationId,
    setProjectId,
    ensureSelectedTenantInOptions
  };
});

export function useConsoleProjectScopeStoreHook() {
  return useConsoleProjectScopeStore(store);
}
