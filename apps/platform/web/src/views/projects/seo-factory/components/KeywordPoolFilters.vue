<!--
  关键词池筛选区：快捷筛选、状态/意图/专题下拉与批量操作条。

  边界：
  - 不负责：关键词列表渲染（KeywordPoolTable）
-->
<template>
  <div>
    <div v-if="schedulingSummary?.unclusteredCount && quickFilter !== 'unclustered'" class="mb-4">
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>
          {{ schedulingSummary.unclusteredCount }} 个关键词尚未分组
        </template>
        <template #default>
          <span class="text-sm text-gray-600">建议先加入专题，再按主题批量创建任务。</span>
          <el-button link type="primary" class="ml-1" @click="emit('go-unclustered')">
            查看未分组
          </el-button>
        </template>
      </el-alert>
    </div>

    <div
      v-if="schedulingSummary?.highPriorityQueueableCount && quickFilter === 'queueable'"
      class="mb-4"
    >
      <el-alert type="success" :closable="false" show-icon>
        <template #title>
          {{ schedulingSummary.highPriorityQueueableCount }} 个高优先级待写词
        </template>
        <template #default>
          <span class="text-sm text-gray-600">建议优先勾选这些词创建任务或加入专题后排产。</span>
        </template>
      </el-alert>
    </div>

    <div v-if="filterClusterId || quickFilter !== 'all'" class="mb-4">
      <el-alert type="info" :closable="false" show-icon :title="activeFilterTitle">
        <template #default>
          <el-button link type="primary" @click="emit('clear-filters')">查看全部关键词</el-button>
        </template>
      </el-alert>
    </div>

    <div v-if="selectedCount" class="mb-4 flex flex-wrap items-center gap-2">
      <span class="text-sm text-gray-600">已选 {{ selectedCount }} 项</span>
      <el-button v-if="canManageKeywords" size="small" @click="emit('assign-cluster')">
        加入专题
      </el-button>
      <el-button
        v-if="canManageKeywords"
        size="small"
        type="danger"
        plain
        :loading="deleting"
        @click="emit('batch-delete')"
      >
        删除
      </el-button>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <el-radio-group
        :model-value="quickFilter"
        @update:model-value="onQuickFilterChange"
        @change="emit('quick-filter-change')"
      >
        <el-radio-button value="queueable">待写</el-radio-button>
        <el-radio-button value="gscVerified">本站有曝光</el-radio-button>
        <el-radio-button value="unclustered">未分组</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <el-select
        :model-value="filterStatus"
        clearable
        placeholder="状态"
        style="width: 140px"
        @update:model-value="emit('update:filterStatus', $event ?? '')"
        @change="emit('filter-change')"
      >
        <el-option
          v-for="item in keywordStatusDict"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-select
        :model-value="filterIntent"
        clearable
        placeholder="意图"
        style="width: 140px"
        @update:model-value="emit('update:filterIntent', $event ?? '')"
        @change="emit('filter-change')"
      >
        <el-option
          v-for="item in keywordIntentDict"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-select
        :model-value="filterClusterId"
        clearable
        placeholder="专题"
        style="width: 160px"
        @update:model-value="emit('update:filterClusterId', $event ?? '')"
        @change="emit('cluster-filter-change')"
      >
        <el-option
          v-for="item in clusters"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { KeywordClusterItem } from "@/api/seo-factory/keyword-cluster";
import type { KeywordSummary } from "@/api/seo-factory/keyword";
import { keywordIntentDict, keywordStatusDict } from "@/constants/dicts/seo-factory";

defineOptions({ name: "KeywordPoolFilters" });

defineProps<{
  quickFilter: "all" | "queueable" | "unclustered" | "gscVerified";
  filterStatus: string;
  filterIntent: string;
  filterClusterId: string;
  clusters: KeywordClusterItem[];
  schedulingSummary: KeywordSummary | null;
  activeFilterTitle: string;
  selectedCount: number;
  canManageKeywords: boolean;
  deleting: boolean;
}>();

const emit = defineEmits<{
  (e: "update:quickFilter", value: "all" | "queueable" | "unclustered" | "gscVerified"): void;
  (e: "update:filterStatus", value: string): void;
  (e: "update:filterIntent", value: string): void;
  (e: "update:filterClusterId", value: string): void;
  (e: "filter-change"): void;
  (e: "cluster-filter-change"): void;
  (e: "clear-filters"): void;
  (e: "go-unclustered"): void;
  (e: "assign-cluster"): void;
  (e: "batch-delete"): void;
  (e: "quick-filter-change"): void;
}>();

function onQuickFilterChange(value: string | number | boolean | undefined) {
  if (value === "all" || value === "queueable" || value === "unclustered" || value === "gscVerified") {
    emit("update:quickFilter", value);
  }
}
</script>
