<!--
  SEO 工作台模块导航：概览 / 任务 / 词库 / 站点 / 设置。

  边界：
  - 不负责：各页面业务逻辑
-->
<template>
  <nav class="workbench-nav" aria-label="SEO 内容工厂导航">
    <div class="workbench-nav__label">Modules</div>
    <div class="workbench-nav__list">
      <button
        v-for="item in visibleNavItems"
        :key="item.key"
        type="button"
        class="workbench-nav__item"
        :class="{ 'is-active': activeNav === item.key }"
        @click="onNavSelect(item.key)"
      >
        <span class="workbench-nav__icon" aria-hidden="true">
          <IconifyIconOnline :icon="item.icon" />
        </span>
        <span class="workbench-nav__text">
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </span>
      </button>
    </div>
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
  description: string;
  icon: string;
  route: string;
  roles: string[];
}> = [
  {
    key: "overview",
    label: "概览",
    description: "产线状态",
    icon: "ri:dashboard-3-line",
    route: "SeoFactoryOverview",
    roles: ["admin", "common"]
  },
  {
    key: "jobs",
    label: "文章任务",
    description: "生成与发布",
    icon: "ri:article-line",
    route: "SeoFactoryJobs",
    roles: ["admin", "common"]
  },
  {
    key: "keywords",
    label: "关键词池",
    description: "选题与排产",
    icon: "ri:search-2-line",
    route: "SeoFactoryKeywords",
    roles: ["admin", "common"]
  },
  {
    key: "sites",
    label: "站点",
    description: "品牌素材",
    icon: "ri:global-line",
    route: "SeoFactorySites",
    roles: ["admin", "common"]
  },
  {
    key: "settings",
    label: "设置",
    description: "集成与实验",
    icon: "ri:settings-3-line",
    route: "SeoFactorySettings",
    roles: ["admin"]
  }
];

const JOBS_ROUTE_NAMES = new Set([
  "SeoFactoryJobs",
  "SeoFactoryJobCreate",
  "SeoFactoryJobDetail"
]);

const KEYWORDS_ROUTE_NAMES = new Set(["SeoFactoryKeywords", "SeoFactoryTopicClusters"]);

const SETTINGS_ROUTE_NAMES = new Set([
  "SeoFactorySettings",
  "SeoFactoryGsc",
  "SeoFactoryScoreLab",
  "SeoFactoryContentScore"
]);

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

function onNavSelect(key: NavKey) {
  const item = NAV_ITEMS.find((nav) => nav.key === key);
  if (!item || activeNav.value === item.key) return;
  router.push({ name: item.route, params: { projectId: projectId.value } });
}
</script>
