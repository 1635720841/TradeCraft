<!--
  SEO 工作台左侧导航：概览 / 任务 / 词库 / 站点 / 设置。

  边界：
  - 不负责：各页面业务逻辑
-->
<template>
  <nav class="workbench-nav">
    <el-menu
      :default-active="activeNav"
      class="workbench-nav__menu"
      @select="onNavSelect"
    >
      <el-menu-item
        v-for="item in visibleNavItems"
        :key="item.key"
        :index="item.key"
      >
        {{ item.label }}
      </el-menu-item>
    </el-menu>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStoreHook } from "@/store/modules/user";

defineOptions({ name: "SeoFactoryWorkbenchNav" });

type NavKey = "overview" | "jobs" | "keywords" | "sites" | "settings";

const NAV_ITEMS: Array<{
  key: NavKey;
  label: string;
  route: string;
  roles: string[];
}> = [
  { key: "overview", label: "概览", route: "SeoFactoryOverview", roles: ["admin", "common"] },
  { key: "jobs", label: "任务", route: "SeoFactoryJobs", roles: ["admin", "common"] },
  { key: "keywords", label: "词库", route: "SeoFactoryKeywords", roles: ["admin", "common"] },
  { key: "sites", label: "站点", route: "SeoFactorySites", roles: ["admin", "common"] },
  { key: "settings", label: "设置", route: "SeoFactorySettings", roles: ["admin"] }
];

const JOBS_ROUTE_NAMES = new Set([
  "SeoFactoryJobs",
  "SeoFactoryJobCreate",
  "SeoFactoryJobDetail"
]);

const KEYWORDS_ROUTE_NAMES = new Set(["SeoFactoryKeywords", "SeoFactoryTopicClusters"]);

const SETTINGS_ROUTE_NAMES = new Set(["SeoFactorySettings", "SeoFactoryGsc"]);

const route = useRoute();
const router = useRouter();
const userStore = useUserStoreHook();
const projectId = computed(() => route.params.projectId as string);

const visibleNavItems = computed(() =>
  NAV_ITEMS.filter((item) => item.roles.some((role) => userStore.roles.includes(role)))
);

const activeNav = computed((): NavKey => {
  const name = route.name as string | undefined;
  if (name === "SeoFactoryOverview") return "overview";
  if (name && JOBS_ROUTE_NAMES.has(name)) return "jobs";
  if (name && KEYWORDS_ROUTE_NAMES.has(name)) return "keywords";
  if (name === "SeoFactorySites") return "sites";
  if (name && SETTINGS_ROUTE_NAMES.has(name)) return "settings";
  return "overview";
});

function onNavSelect(key: string) {
  const item = NAV_ITEMS.find((nav) => nav.key === key);
  if (!item || activeNav.value === item.key) return;
  router.push({ name: item.route, params: { projectId: projectId.value } });
}
</script>

<style scoped>
.workbench-nav {
  width: 132px;
  flex-shrink: 0;
}

.workbench-nav__menu {
  border-right: none;
  background: transparent;
}

.workbench-nav__menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  margin-bottom: 2px;
  border-radius: 6px;
}

.workbench-nav__menu :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}
</style>
