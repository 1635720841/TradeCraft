<!--
  选题中心布局：全部关键词 / 按主题（页内 Tab）。

  边界：
  - 不负责：各子页面业务逻辑
-->
<template>
  <div class="topic-center">
    <header class="topic-center__head px-4 pt-4">
      <h1 class="topic-center__title">选题</h1>
      <p class="topic-center__desc">
        先收集关键词，归入专题后批量创建文章任务。推荐路径：发现词 → 加入专题 → 按主题排产。
      </p>
    </header>
    <div class="px-4 pt-2">
      <KeywordSchedulingTabs :summary="summary" />
    </div>
    <router-view v-slot="{ Component }">
      <keep-alive :include="['KeywordPoolView', 'TopicClusterView']">
        <component :is="Component" @refresh-summary="refreshSummary" />
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup lang="ts">
import { provide } from "vue";
import { useRoute } from "vue-router";
import KeywordSchedulingTabs from "./KeywordSchedulingTabs.vue";
import { useKeywordSchedulingSummary } from "@/composables/seo-factory/useKeywordSchedulingSummary";
import { keywordSchedulingContextKey } from "@/composables/seo-factory/keyword-scheduling-context";

defineOptions({ name: "KeywordSchedulingLayout" });

const route = useRoute();
const projectId = route.params.projectId as string;
const { summary, refreshSummary } = useKeywordSchedulingSummary(projectId);

provide(keywordSchedulingContextKey, { summary, refreshSummary });
</script>
