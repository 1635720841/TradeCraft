<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { transformI18n } from "@/plugins/i18n";

const route = useRoute();

const pageTitle = computed(() => {
  const title = route.meta?.title;
  if (title == null || title === "") return "首页";
  return transformI18n(title);
});
</script>

<template>
  <h1 class="shell-topbar-title">{{ pageTitle }}</h1>
</template>
