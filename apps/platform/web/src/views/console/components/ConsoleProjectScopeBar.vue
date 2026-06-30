<!--
  Console 实验室/诊断：企业 + 项目选择条。

  边界：
  - 不负责：业务数据加载
-->
<template>
  <el-card shadow="never" class="mb-4">
    <el-form inline label-width="auto" @submit.prevent>
      <el-form-item label="企业">
        <el-select
          v-model="organizationId"
          filterable
          clearable
          :loading="tenantsLoading"
          placeholder="选择企业"
          style="width: 220px"
          @change="onTenantChange"
        >
          <el-option
            v-for="item in tenants"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="项目">
        <el-select
          v-model="projectId"
          :disabled="!organizationId"
          :loading="projectsLoading"
          filterable
          clearable
          placeholder="选择 SEO 项目"
          style="width: 220px"
          @change="onProjectChange"
        >
          <el-option
            v-for="item in projects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="selectedProject">
        <span class="text-xs text-gray-500">{{ selectedProject.siteCount }} 个站点</span>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useConsoleProjectScope } from "@/composables/console/useConsoleProjectScope";

defineOptions({ name: "ConsoleProjectScopeBar" });

const {
  tenantsLoading,
  projectsLoading,
  tenants,
  projects,
  organizationId,
  projectId,
  selectedProject,
  syncFromRoute,
  loadTenants,
  loadProjects,
  onTenantChange,
  onProjectChange
} = useConsoleProjectScope();

onMounted(async () => {
  syncFromRoute();
  await loadTenants();
  if (organizationId.value) await loadProjects();
});
</script>
