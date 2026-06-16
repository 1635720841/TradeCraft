<!--
  旧 /gsc 路径重定向到设置页搜索表现区块。

  边界：
  - 不负责：GSC 业务逻辑（ProjectSettingsView）
-->
<template>
  <div />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

defineOptions({ name: "GscRedirectView" });

const route = useRoute();
const router = useRouter();

onMounted(() => {
  void router.replace({
    name: "SeoFactorySettings",
    params: route.params,
    hash: "#gsc"
  });
});
</script>
