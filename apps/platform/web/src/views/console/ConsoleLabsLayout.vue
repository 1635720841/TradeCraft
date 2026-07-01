<!--
  Console 实验室布局：项目诊断 / 评分校准 / 内容评分 子页签壳。

  边界：
  - 不负责：各子页面业务逻辑
-->
<template>
  <div class="p-4 space-y-4">
    <ConsoleProjectScopeBar @search-tenants="onSearchTenants" />
    <el-tabs :model-value="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="项目诊断" name="diagnostics" />
      <el-tab-pane label="评分校准实验室" name="score-calibration" />
      <el-tab-pane label="内容评分" name="content-score" />
    </el-tabs>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import ConsoleProjectScopeBar from "./components/ConsoleProjectScopeBar.vue";
import { useConsoleProjectScope } from "@/composables/console/useConsoleProjectScope";

defineOptions({ name: "ConsoleLabsLayout" });

const route = useRoute();
const router = useRouter();
const { loadTenants } = useConsoleProjectScope();

const TAB_ROUTES: Record<string, string> = {
  diagnostics: "/console/labs/diagnostics",
  "score-calibration": "/console/labs/score-calibration",
  "content-score": "/console/labs/content-score"
};

const activeTab = computed(() => {
  if (route.path.includes("/score-calibration")) return "score-calibration";
  if (route.path.includes("/content-score")) return "content-score";
  return "diagnostics";
});

function onTabChange(name: string | number) {
  const path = TAB_ROUTES[String(name)];
  if (path && route.path !== path) {
    void router.push(path);
  }
}

function onSearchTenants(keyword: string) {
  void loadTenants(keyword);
}
</script>
