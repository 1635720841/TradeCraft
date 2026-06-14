<!--
  项目列表页：展示企业下所有项目。

  边界：
  - 不负责：项目内部业务（由 project-type 插件页面处理）
-->

<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">项目列表</span>
          <el-button type="primary" link @click="fetchProjects">刷新</el-button>
        </div>
      </template>

      <el-table v-loading="loading" :data="projects" stripe style="width: 100%">
        <el-table-column prop="name" label="项目名称" min-width="180" />
        <el-table-column prop="projectType" label="项目类型" min-width="140" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="id" label="ID" min-width="280" show-overflow-tooltip />
      </el-table>

      <el-empty v-if="!loading && projects.length === 0" description="暂无项目" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { listProjects, type ProjectItem } from "@/api/platform/project";

defineOptions({ name: "ProjectListView" });

const loading = ref(false);
const projects = ref<ProjectItem[]>([]);

async function fetchProjects() {
  loading.value = true;
  try {
    projects.value = await listProjects();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchProjects();
});
</script>
