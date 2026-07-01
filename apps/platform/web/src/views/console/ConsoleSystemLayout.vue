<!--
  Console 系统管理布局：审计 / 健康 / GSC / Prompt 子页共用企业项目范围条。
-->
<template>
  <div class="p-4 space-y-4">
    <ConsoleProjectScopeBar @search-tenants="onSearchTenants" />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import ConsoleProjectScopeBar from "./components/ConsoleProjectScopeBar.vue";
import { useConsoleProjectScope } from "@/composables/console/useConsoleProjectScope";

defineOptions({ name: "ConsoleSystemLayout" });

const { loadTenants } = useConsoleProjectScope();

function onSearchTenants(keyword: string) {
  void loadTenants(keyword);
}
</script>
