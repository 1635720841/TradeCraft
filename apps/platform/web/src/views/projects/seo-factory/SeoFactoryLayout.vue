<!--
  SEO 工厂工作台壳：左侧导航 + 内容区。

  边界：
  - 不负责：各子页面业务逻辑
-->
<template>
  <SeoFactoryWorkbenchShell>
    <router-view />
  </SeoFactoryWorkbenchShell>
</template>

<script setup lang="ts">
import SeoFactoryWorkbenchShell from "./components/SeoFactoryWorkbenchShell.vue";

defineOptions({ name: "SeoFactoryLayout" });
</script>
