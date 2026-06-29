<!--
  SEO 工厂工作台壳：左侧导航 + 内容区。

  边界：
  - 不负责：各子页面业务逻辑
-->
<template>
  <SeoFactoryWorkbenchShell>
    <router-view v-slot="{ Component }">
      <keep-alive :include="keepAliveViews" :max="8">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </SeoFactoryWorkbenchShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SeoFactoryWorkbenchShell from "./components/SeoFactoryWorkbenchShell.vue";

defineOptions({ name: "SeoFactoryLayout" });

const keepAliveViews = computed(() => [
  "WorkbenchOverviewView",
  "JobListView",
  "KeywordSchedulingLayout",
  "SiteManageView",
  "ProjectSettingsView"
]);
</script>
