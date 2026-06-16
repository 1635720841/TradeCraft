<!--
  词库页内导航：关键词池 / 主题集群。

  边界：
  - 不负责：各 Tab 页业务逻辑
-->
<template>
  <el-tabs :model-value="activeTab" class="keyword-scheduling-tabs mb-4" @tab-change="onTabChange">
    <el-tab-pane label="关键词池" name="keywords" />
    <el-tab-pane label="主题集群" name="topic-clusters" />
  </el-tabs>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

defineOptions({ name: "KeywordSchedulingTabs" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.projectId as string);

const activeTab = computed(() => {
  const name = route.name as string | undefined;
  if (name === "SeoFactoryTopicClusters") return "topic-clusters";
  return "keywords";
});

function onTabChange(tab: string | number) {
  const routes: Record<string, string> = {
    keywords: "SeoFactoryKeywords",
    "topic-clusters": "SeoFactoryTopicClusters"
  };
  const name = routes[String(tab)];
  if (!name || route.name === name) return;
  router.push({ name, params: { projectId: projectId.value } });
}
</script>

<style scoped>
.keyword-scheduling-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
</style>
