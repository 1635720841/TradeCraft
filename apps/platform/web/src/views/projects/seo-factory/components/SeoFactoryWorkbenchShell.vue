<!--
  SEO 工厂工作台壳：项目上下文 + 左侧导航 + 内容区。

  边界：
  - 不负责：各子页面数据加载
-->
<template>
  <div class="seo-factory-workbench">
    <div
      class="workbench-header mb-4 rounded-lg border border-[var(--el-border-color-light)] bg-[var(--el-bg-color)] px-4 py-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <el-button link type="primary" @click="goProjects">← 返回首页</el-button>
            <span class="text-gray-300">|</span>
            <span class="font-medium">{{ projectName || "SEO 内容工厂" }}</span>
          </div>
          <p v-if="projectName" class="mt-1 text-sm text-gray-500">
            创建文章 → 确认大纲 → 审核 → 发布到网站
          </p>
        </div>
        <el-tooltip
          :disabled="siteCount > 0"
          content="请先在「站点」创建站点"
          placement="bottom"
        >
          <el-button type="primary" :disabled="siteCount === 0" @click="goCreateJob">
            新建任务
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="workbench-body flex gap-4">
      <SeoFactoryWorkbenchNav />
      <div class="workbench-content min-w-0 flex-1">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getProject } from "@/api/platform/project";
import { getSeoFactoryProjectStats } from "@/api/seo-factory/article-job";
import SeoFactoryWorkbenchNav from "./SeoFactoryWorkbenchNav.vue";

defineOptions({ name: "SeoFactoryWorkbenchShell" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.projectId as string);
const projectName = ref("");
const siteCount = ref(0);

async function loadContext() {
  if (!projectId.value) return;
  try {
    const [project, stats] = await Promise.all([
      getProject(projectId.value),
      getSeoFactoryProjectStats(projectId.value)
    ]);
    projectName.value = project.name;
    siteCount.value = stats.siteCount;
  } catch {
    projectName.value = "";
    siteCount.value = 0;
  }
}

function goProjects() {
  router.push({ name: "Welcome" });
}

function goCreateJob() {
  router.push({ name: "SeoFactoryJobCreate", params: { projectId: projectId.value } });
}

watch(projectId, () => {
  void loadContext();
});

onMounted(() => {
  void loadContext();
});
</script>
