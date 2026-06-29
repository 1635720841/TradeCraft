<!--
  首页图标：基于 Lucide（https://lucide.dev/icons/）统一风格。
-->
<script setup lang="ts">
import { computed, type Component } from "vue";
import {
  Calendar,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  FileSearch,
  FileText,
  Globe,
  Info,
  Plus,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles
} from "@lucide/vue";

defineOptions({ inheritAttrs: false });

type HomeIconName =
  | "wave"
  | "plus"
  | "refresh"
  | "globe"
  | "workflow"
  | "quality"
  | "settings"
  | "usage"
  | "info"
  | "calendar"
  | "seo"
  | "check"
  | "brief"
  | "review"
  | "publish"
  | "alert";

const props = withDefaults(
  defineProps<{
    name: HomeIconName;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 20,
    strokeWidth: 1.75
  }
);

const iconMap: Record<HomeIconName, Component> = {
  wave: Sparkles,
  plus: Plus,
  refresh: RefreshCw,
  globe: Globe,
  workflow: Route,
  quality: ShieldCheck,
  settings: SlidersHorizontal,
  usage: ChartColumn,
  info: Info,
  calendar: Calendar,
  seo: FileSearch,
  check: CircleCheck,
  brief: FileText,
  review: ClipboardCheck,
  publish: Send,
  alert: CircleAlert
};

const IconComponent = computed(() => iconMap[props.name]);
</script>

<template>
  <component
    :is="IconComponent"
    class="mw-home-icon"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
    v-bind="$attrs"
  />
</template>

<style scoped>
.mw-home-icon {
  display: block;
  flex-shrink: 0;
}
</style>
