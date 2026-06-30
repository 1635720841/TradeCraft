<!--
  SEO 工作台图标：Lucide 统一风格。
-->
<script setup lang="ts">
import { computed, type Component } from "vue";
import {
  ArrowLeft,
  FileText,
  Globe,
  LayoutDashboard,
  Plus,
  Search,
  Settings
} from "@lucide/vue";

defineOptions({ inheritAttrs: false, name: "WorkbenchIcon" });

export type WorkbenchIconName =
  | "overview"
  | "jobs"
  | "keywords"
  | "sites"
  | "settings"
  | "back"
  | "add"
  | "globe";

const props = withDefaults(
  defineProps<{
    name: WorkbenchIconName;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 18,
    strokeWidth: 1.75
  }
);

const iconMap: Record<WorkbenchIconName, Component> = {
  overview: LayoutDashboard,
  jobs: FileText,
  keywords: Search,
  sites: Globe,
  settings: Settings,
  back: ArrowLeft,
  add: Plus,
  globe: Globe
};

const IconComponent = computed(() => iconMap[props.name]);
</script>

<template>
  <component
    :is="IconComponent"
    class="workbench-icon"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
    v-bind="$attrs"
  />
</template>

<style scoped>
.workbench-icon {
  display: block;
  flex-shrink: 0;
}
</style>
