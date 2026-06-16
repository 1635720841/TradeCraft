<!--
  词库布局：关键词池 / 主题集群（页内 Tab）。

  边界：
  - 不负责：各子页面业务逻辑
-->
<template>
  <div class="px-4 pt-2">
    <KeywordSchedulingTabs />
  </div>
  <router-view />
</template>

<script setup lang="ts">
import KeywordSchedulingTabs from "./KeywordSchedulingTabs.vue";

defineOptions({ name: "KeywordSchedulingLayout" });
</script>
