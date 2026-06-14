<!--
  稿件手动编辑历史：列表与回滚。

  边界：
  - 不负责：加载任务详情（由父组件刷新）
-->
<template>
  <div v-if="items.length" class="mt-4">
    <div class="mb-2 text-sm font-medium text-gray-700">编辑历史</div>
    <el-table :data="items" size="small" stripe>
      <el-table-column label="时间" min-width="160">
        <template #default="{ row }">
          {{ formatTime(row.editedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="变更" min-width="200">
        <template #default="{ row }">
          <span v-if="row.changeSummary.titleChanged">标题 </span>
          <span v-if="row.changeSummary.metaChanged">Meta </span>
          <span v-if="row.changeSummary.contentDiffStats.charsBefore !== row.changeSummary.contentDiffStats.charsAfter">
            正文 {{ row.changeSummary.contentDiffStats.charsBefore }}→{{ row.changeSummary.contentDiffStats.charsAfter }} 字
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            link
            :loading="rollingBackId === row.id"
            :disabled="Boolean(rollingBackId)"
            @click="emit('rollback', row.id)"
          >
            回滚
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import type { ManualEditHistoryEntry } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobDraftHistory" });

defineProps<{
  items: ManualEditHistoryEntry[];
  rollingBackId?: string | null;
}>();

const emit = defineEmits<{
  rollback: [historyId: string];
}>();

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
</script>
