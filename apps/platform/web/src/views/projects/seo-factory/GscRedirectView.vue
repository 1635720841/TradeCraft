<!--
  旧 /gsc 路径重定向到站点详情搜索表现 Tab。

  边界：
  - 不负责：GSC 业务逻辑（SiteDetailView / GscPerformanceView）
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
  const projectId = route.params.projectId;
  const siteId = route.query.siteId;
  if (typeof siteId === "string" && siteId) {
    void router.replace({
      name: "SeoFactorySiteDetail",
      params: { projectId, siteId },
      query: { tab: "search" }
    });
    return;
  }
  void router.replace({ name: "SeoFactorySites", params: { projectId } });
});
</script>
