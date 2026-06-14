<!--
  SEO 工厂工作台导航壳：项目上下文 + Tab 导航。

  边界：
  - 不负责：子页面数据加载
-->
<template>
  <div class="seo-factory-workbench">
    <div class="workbench-header mb-4 rounded-lg border border-[var(--el-border-color-light)] bg-[var(--el-bg-color)] px-4 py-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <el-button link type="primary" @click="goProjects">← 返回项目列表</el-button>
            <span class="text-gray-300">|</span>
            <span class="font-medium">{{ projectName || "SEO 内容工厂" }}</span>
            <el-tag size="small" type="info">seo-factory</el-tag>
          </div>
          <p v-if="projectName" class="mt-1 text-sm text-gray-500">
            管理站点、创建文章任务、处理 YMYL 审核与导出
          </p>
        </div>
        <el-button type="primary" @click="goCreateJob">新建任务</el-button>
      </div>
    </div>

    <el-menu
      :default-active="activeMenu"
      mode="horizontal"
      class="workbench-menu mb-4 rounded-lg border border-[var(--el-border-color-light)]"
      @select="handleMenuSelect"
    >
      <el-menu-item index="overview">概览</el-menu-item>
      <el-menu-item index="jobs">文章任务</el-menu-item>
      <el-menu-item index="keywords">关键词池</el-menu-item>
      <el-menu-item index="sites">站点管理</el-menu-item>
      <el-menu-item index="reviews">
        待审核
        <el-badge
          v-if="pendingReviewCount > 0"
          :value="pendingReviewCount"
          class="ml-2"
          type="warning"
        />
      </el-menu-item>
    </el-menu>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getProject } from "@/api/platform/project";
import { getSeoFactoryProjectStats } from "@/api/seo-factory/article-job";

defineOptions({ name: "SeoFactoryWorkbenchShell" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.projectId as string);
const projectName = ref("");
const pendingReviewCount = ref(0);

const activeMenu = computed(() => {
  const name = route.name as string | undefined;
  if (name === "SeoFactoryOverview") return "overview";
  if (name === "SeoFactorySites") return "sites";
  if (name === "SeoFactoryReviews") return "reviews";
  if (name === "SeoFactoryKeywords") return "keywords";
  return "jobs";
});

async function loadContext() {
  if (!projectId.value) return;
  try {
    const [project, stats] = await Promise.all([
      getProject(projectId.value),
      getSeoFactoryProjectStats(projectId.value)
    ]);
    projectName.value = project.name;
    pendingReviewCount.value = stats.pendingReviewCount;
  } catch {
    projectName.value = "";
    pendingReviewCount.value = 0;
  }
}

function handleMenuSelect(index: string) {
  const routes: Record<string, string> = {
    overview: "SeoFactoryOverview",
    jobs: "SeoFactoryJobs",
    keywords: "SeoFactoryKeywords",
    sites: "SeoFactorySites",
    reviews: "SeoFactoryReviews"
  };
  const name = routes[index];
  if (!name || route.name === name) return;
  router.push({ name, params: { projectId: projectId.value } });
}

function goProjects() {
  router.push({ name: "PlatformProjects" });
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

<style scoped>
.workbench-menu :deep(.el-menu-item) {
  height: 44px;
}
</style>
