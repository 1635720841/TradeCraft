<!--
  SEO 工厂工作台壳：项目上下文 + 模块导航 + 内容区。

  边界：
  - 不负责：各子页面数据加载
-->
<template>
  <div class="seo-factory-workbench">
    <section class="workbench-header">
      <div class="workbench-header__main">
        <el-button
          link
          type="primary"
          class="workbench-header__back"
          title="返回项目首页"
          @click="goProjects"
        >
          <IconifyIconOnline icon="ri:arrow-left-line" />
        </el-button>
        <div class="workbench-header__title-wrap">
          <div class="workbench-header__title-row">
            <h1>{{ projectName || "SEO 内容工厂" }}</h1>
            <span class="workbench-header__badge">外贸获客内容产线</span>
          </div>
        </div>
      </div>

      <div class="workbench-header__aside">
        <span class="workbench-header__stat">
          站点 <strong>{{ siteCount }}</strong>
        </span>
        <el-tooltip
          :disabled="siteCount > 0"
          content="请先在「站点」创建站点"
          placement="bottom"
        >
          <el-button
            type="primary"
            size="small"
            :disabled="siteCount === 0"
            @click="goCreateJob"
          >
            <IconifyIconOnline icon="ri:add-line" class="mr-1" />
            新建任务
          </el-button>
        </el-tooltip>
      </div>
    </section>

    <div class="workbench-body">
      <SeoFactoryWorkbenchNav />
      <main class="workbench-content">
        <slot />
      </main>
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
