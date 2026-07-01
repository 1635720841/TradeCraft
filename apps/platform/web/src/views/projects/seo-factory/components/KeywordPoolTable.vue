<!--
  关键词池表格：列定义、分页与行操作。

  边界：
  - 不负责：筛选控件（KeywordPoolFilters）、弹窗表单
-->
<template>
  <div>
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="keywords"
      stripe
      @selection-change="(rows) => emit('selection-change', rows as KeywordEntryItem[])"
    >
      <el-table-column type="selection" width="48" :selectable="isRowSelectable" />
      <el-table-column prop="keyword" label="关键词" min-width="180" show-overflow-tooltip />
      <el-table-column label="站点搜索" width="108">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.gscInsight && row.gscInsight.status !== 'none'"
            :content="gscInsightHint(row.gscInsight)"
            placement="top"
          >
            <el-tag :type="gscInsightTagType(row.gscInsight.status)" size="small">
              {{ gscInsightLabel(row.gscInsight.status) }}
            </el-tag>
          </el-tooltip>
          <span v-else class="text-xs text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="priorityScore" label="建议优先级" width="108" sortable>
        <template #default="{ row }">
          <el-tooltip :content="priorityHint(row.priorityScore)" placement="top">
            <el-tag :type="priorityTierTagType(row.priorityScore)" size="small">
              {{ priorityTierLabel(row.priorityScore) }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="intent" label="意图" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="dictTagType(keywordIntentDict, row.intent)">
            {{ dictLabel(keywordIntentDict, row.intent) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="专题" width="130" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.cluster?.name">{{ row.cluster.name }}</span>
          <span v-else class="text-gray-400">未分组</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="88">
        <template #default="{ row }">
          <el-tag size="small" :type="displayStatus(row.status).type">
            {{ displayStatus(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="100">
        <template #default="{ row }">
          {{ dictLabel(keywordSourceDict, row.source) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="canManageKeywords && row.gscInsight && row.gscInsight.status !== 'none'"
            type="primary"
            link
            @click="emit('expand-from-gsc', row as KeywordEntryItem)"
          >
            AI 扩展
          </el-button>
          <el-button
            v-if="row.status !== 'ARCHIVED' && row.status !== 'USED'"
            type="primary"
            link
            :loading="creatingJobId === row.id"
            @click="emit('create-job', row as KeywordEntryItem)"
          >
            创建任务
          </el-button>
          <el-button
            v-if="row.lastJobId"
            type="primary"
            link
            @click="emit('go-job-detail', row.lastJobId!)"
          >
            查看任务
          </el-button>
          <el-button
            v-if="canManageKeywords"
            type="primary"
            link
            @click="emit('edit-row', row as KeywordEntryItem)"
          >
            编辑
          </el-button>
          <el-button
            v-if="canManageKeywords"
            type="danger"
            link
            :loading="deletingId === row.id"
            @click="emit('delete-row', row as KeywordEntryItem)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="mt-4 flex justify-end">
      <el-pagination
        :current-page="page"
        :page-size="limit"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @update:current-page="emit('update:page', $event)"
        @update:page-size="emit('update:limit', $event)"
        @current-change="emit('page-change')"
        @size-change="emit('size-change')"
      />
    </div>

    <el-empty v-if="!loading && keywords.length === 0" :description="emptyKeywordHint" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { TableInstance } from "element-plus";
import type { GscKeywordInsight, KeywordEntryItem } from "@/api/seo-factory/keyword";
import {
  keywordIntentDict,
  keywordSourceDict
} from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import {
  getKeywordDisplayStatus,
  getKeywordPriorityTier,
  getKeywordPriorityTierHint,
  getKeywordPriorityTierLabel,
  getKeywordPriorityTierTagType,
  isKeywordQueueable
} from "@/utils/seo-factory/keyword-display";
import {
  getGscKeywordInsightHint,
  getGscKeywordInsightLabel,
  getGscKeywordInsightTagType,
  type GscKeywordInsightStatus
} from "@/utils/seo-factory/gsc-keyword-display";

defineOptions({ name: "KeywordPoolTable" });

defineProps<{
  loading: boolean;
  keywords: KeywordEntryItem[];
  canManageKeywords: boolean;
  creatingJobId: string | null;
  deletingId: string | null;
  page: number;
  limit: number;
  total: number;
  emptyKeywordHint: string;
}>();

const emit = defineEmits<{
  (e: "selection-change", rows: KeywordEntryItem[]): void;
  (e: "create-job", row: KeywordEntryItem): void;
  (e: "go-job-detail", jobId: string): void;
  (e: "edit-row", row: KeywordEntryItem): void;
  (e: "delete-row", row: KeywordEntryItem): void;
  (e: "expand-from-gsc", row: KeywordEntryItem): void;
  (e: "update:page", page: number): void;
  (e: "update:limit", limit: number): void;
  (e: "page-change"): void;
  (e: "size-change"): void;
}>();

const tableRef = ref<TableInstance>();

function isRowSelectable(row: KeywordEntryItem) {
  return isKeywordQueueable(row.status);
}

function displayStatus(status: string) {
  return getKeywordDisplayStatus(status);
}

function priorityTierLabel(score: number) {
  return getKeywordPriorityTierLabel(getKeywordPriorityTier(score));
}

function priorityTierTagType(score: number) {
  return getKeywordPriorityTierTagType(getKeywordPriorityTier(score));
}

function priorityHint(score: number) {
  return getKeywordPriorityTierHint(getKeywordPriorityTier(score));
}

function gscInsightLabel(status: GscKeywordInsightStatus) {
  return getGscKeywordInsightLabel(status);
}

function gscInsightTagType(status: GscKeywordInsightStatus) {
  return getGscKeywordInsightTagType(status);
}

function gscInsightHint(insight: GscKeywordInsight) {
  return getGscKeywordInsightHint(insight);
}

function clearSelection() {
  tableRef.value?.clearSelection();
}

defineExpose({ clearSelection });
</script>
