<!--
  SERP 检索结果展示：organic 排名列表。

  边界：
  - 不负责：数据拉取（由父组件传入 serpData）
-->
<template>
  <div>
    <div v-if="fingerprint" class="mb-3 text-sm text-gray-500">
      缓存指纹：{{ fingerprint }}
      <span v-if="fromCache"> · 本次来自搜索缓存</span>
      <span v-else-if="fromCache === false"> · 本次实时拉取</span>
    </div>

    <el-alert
      v-if="filterMeta"
      type="info"
      :closable="false"
      show-icon
      class="mb-3"
    >
      <template #title>
        {{ filterMetaTitle }}
      </template>
    </el-alert>

    <el-table
      v-if="organic.length"
      :data="organic"
      stripe
      style="width: 100%"
      max-height="480"
    >
      <el-table-column prop="position" label="#" width="56" />
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link :href="row.link" target="_blank" type="primary" :underline="false">
            {{ row.title }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="snippet" label="摘要" min-width="280" show-overflow-tooltip />
      <el-table-column prop="link" label="链接" min-width="180" show-overflow-tooltip />
    </el-table>

    <el-empty v-else description="暂无搜索结果数据（任务进行中或检索失败）" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobSerpData } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobSerpPanel" });

const props = defineProps<{
  serpData?: ArticleJobSerpData | null;
}>();

const organic = computed(() => props.serpData?.organic ?? []);
const fingerprint = computed(() => props.serpData?.fingerprint);
const fromCache = computed(() => props.serpData?.fromCache);
const filterMeta = computed(() => props.serpData?.filterMeta);

const filterMetaTitle = computed(() => {
  const meta = filterMeta.value;
  if (!meta) return "";
  if (meta.backfillKept != null && meta.backfillKept > 0) {
    return `已分析 ${meta.kept} 条结果（博客 ${meta.articleKept ?? 0} 篇，另补充 ${meta.backfillKept} 条；来自 Google 前 ${meta.total} 条）`;
  }
  if (meta.articlesOnly) {
    return `已分析 ${meta.kept} 篇博客/资讯类结果（来自 Google 前 ${meta.total} 条，目标最多 ${meta.limit} 篇）`;
  }
  return `已分析 ${meta.kept} 条搜索结果（来自 Google 前 ${meta.total} 条）`;
});
</script>
