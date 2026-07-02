<!--
  demo-factory 工作台布局壳层。
-->
<template>
  <div class="demo-factory-layout">
    <header class="demo-factory-layout__head">
      <h1 class="text-lg font-medium">演示插件工作台</h1>
      <p class="text-sm text-gray-500">用于验证多项目类型插件注册与 enterPath 跳转。</p>
    </header>
    <router-view />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "DemoFactoryLayout" });
</script>

<style scoped>
.demo-factory-layout {
  padding: 16px;
}
.demo-factory-layout__head {
  margin-bottom: 16px;
}
</style>
