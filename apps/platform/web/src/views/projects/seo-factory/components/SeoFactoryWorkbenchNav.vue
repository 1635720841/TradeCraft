<!--
  SEO 工作台模块导航：概览 / 任务 / 选题 / 站点。

  边界：
  - 不负责：各页面业务逻辑；项目配置在壳层头部入口
-->
<template>
  <nav class="workbench-nav" aria-label="SEO 内容工厂导航">
    <div class="workbench-nav__label">功能模块</div>
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
          <WorkbenchIcon :name="item.key" />
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
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import WorkbenchIcon from "./WorkbenchIcon.vue";

defineOptions({ name: "SeoFactoryWorkbenchNav" });

type NavKey = "overview" | "jobs" | "keywords" | "sites" | "settings";

const NAV_ITEMS: Array<{
  key: NavKey;
  label: string;
  description: string;
  route: string;
  seoPermission: string | string[];
}> = [
  {
    key: "overview",
    label: "概览",
    description: "产线状态",
    route: "SeoFactoryOverview",
    seoPermission: "seo:job:read"
  },
  {
    key: "jobs",
    label: "文章任务",
    description: "生成与发布",
    route: "SeoFactoryJobs",
    seoPermission: "seo:job:read"
  },
  {
    key: "keywords",
    label: "选题",
    description: "关键词与专题",
    route: "SeoFactoryKeywords",
    seoPermission: "seo:job:read"
  },
  {
    key: "sites",
    label: "站点",
    description: "品牌素材",
    route: "SeoFactorySites",
    seoPermission: "seo:job:read"
  },
  {
    key: "settings",
    label: "项目配置",
    description: "流程与集成",
    route: "SeoFactorySettings",
    seoPermission: "seo:site:manage"
  }
];

const JOBS_ROUTE_NAMES = new Set([
  "SeoFactoryJobs",
  "SeoFactoryJobCreate",
  "SeoFactoryJobDetail"
]);

const KEYWORDS_ROUTE_NAMES = new Set(["SeoFactoryKeywords", "SeoFactoryTopicClusters"]);

const SITES_ROUTE_NAMES = new Set(["SeoFactorySites", "SeoFactorySiteDetail"]);

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.projectId as string);
const { can } = useProjectSeoAccess();

const visibleNavItems = computed(() =>
  NAV_ITEMS.filter(item => can(item.seoPermission))
);

const activeNav = computed((): NavKey => {
  const name = route.name as string | undefined;
  if (name === "SeoFactoryOverview") return "overview";
  if (name && JOBS_ROUTE_NAMES.has(name)) return "jobs";
  if (name && KEYWORDS_ROUTE_NAMES.has(name)) return "keywords";
  if (name && SITES_ROUTE_NAMES.has(name)) return "sites";
  if (name === "SeoFactorySettings") return "settings";
  return "overview";
});

function onNavSelect(key: NavKey) {
  const item = NAV_ITEMS.find(nav => nav.key === key);
  if (!item || activeNav.value === item.key) return;
  router.push({ name: item.route, params: { projectId: projectId.value } });
}
</script>
