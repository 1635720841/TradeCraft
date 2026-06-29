<!--
  选题中心页内导航：全部关键词 / 按主题。

  边界：
  - 不负责：各 Tab 页业务逻辑
-->
<template>
  <el-tabs :model-value="activeTab" class="keyword-scheduling-tabs" @tab-change="onTabChange">
    <el-tab-pane name="keywords">
      <template #label>
        <span class="keyword-scheduling-tabs__label">
          全部关键词
          <el-badge
            v-if="summary?.queueableCount"
            :value="summary.queueableCount"
            type="warning"
            class="keyword-scheduling-tabs__badge"
          />
        </span>
      </template>
    </el-tab-pane>
    <el-tab-pane name="topic-clusters">
      <template #label>
        <span class="keyword-scheduling-tabs__label">
          按主题
          <el-badge
            v-if="summary?.clusterCount"
            :value="summary.clusterCount"
            type="info"
            class="keyword-scheduling-tabs__badge"
          />
        </span>
      </template>
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { KeywordSummary } from "@/api/seo-factory/keyword";

defineOptions({ name: "KeywordSchedulingTabs" });

defineProps<{
  summary?: KeywordSummary | null;
}>();

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

  const query = { ...route.query };
  if (name === "SeoFactoryKeywords") {
    delete query.clusterId;
  }

  router.replace({ name, params: { projectId: projectId.value }, query });
}
</script>

<style scoped>
.keyword-scheduling-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.keyword-scheduling-tabs__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.keyword-scheduling-tabs__badge :deep(.el-badge__content) {
  position: static;
  transform: none;
}
</style>
