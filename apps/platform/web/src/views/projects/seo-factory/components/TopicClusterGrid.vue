<!--
  专题排产卡片网格：概览页展示待写进度最高的专题。

  边界：
  - 不负责：专题数据拉取（WorkbenchOverviewView）
-->
<template>
  <section v-loading="loading" class="overview-panel">
    <header class="overview-panel__head">
      <div>
        <span class="overview-panel__kicker">专题排产</span>
        <h2 class="overview-panel__title">
          {{ clusters.length ? "专题排产" : "选题机会" }}
        </h2>
        <p class="overview-panel__desc">
          按专题管理文章矩阵，优先处理待写数量最多的内容组。
        </p>
      </div>
      <el-button link type="primary" @click="emit('go-all')">全部专题</el-button>
    </header>
    <div class="overview-panel__body">
      <div v-if="clusters.length" class="cluster-list">
        <div
          v-for="cluster in clusters"
          :key="cluster.id"
          class="cluster-card cluster-card--clickable"
          role="button"
          tabindex="0"
          @click="emit('select', cluster.id)"
          @keydown.enter="emit('select', cluster.id)"
          @keydown.space.prevent="emit('select', cluster.id)"
        >
          <div class="cluster-card__head">
            <span class="cluster-card__name">{{ cluster.name }}</span>
            <el-tag v-if="(cluster.pendingCount ?? 0) > 0" size="small" type="warning">
              待写 {{ cluster.pendingCount }}
            </el-tag>
            <el-tag v-else size="small" type="success">已完成</el-tag>
          </div>
          <el-progress
            :percentage="cluster.progressPercent ?? 0"
            :stroke-width="8"
            :status="(cluster.progressPercent ?? 0) >= 100 ? 'success' : undefined"
          />
        </div>
      </div>
      <template v-else-if="keywordQueueableCount > 0">
        <p class="mb-3 text-sm mw-text-body">
          {{ keywordQueueableCount }} 个关键词待写，建议先加入专题再批量创建任务。
        </p>
        <el-button type="primary" size="small" @click="emit('go-queueable')">
          查看待写
        </el-button>
      </template>
      <el-empty v-else description="暂无主题排产数据" :image-size="72" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { KeywordClusterItem } from "@/api/seo-factory/keyword-cluster";

defineOptions({ name: "TopicClusterGrid" });

defineProps<{
  loading: boolean;
  clusters: KeywordClusterItem[];
  keywordQueueableCount: number;
}>();

const emit = defineEmits<{
  select: [clusterId: string];
  "go-all": [];
  "go-queueable": [];
}>();
</script>
