<!--
  关键词池：GSC 未收录搜索词导入对话框。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="加入本站 Google 搜索词"
    width="640px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="站点在 Google 已有搜索曝光，词库尚未收录"
      description="以下为您站点在 Google 搜索控制台中的真实搜索词（已获得展示），尚未加入词库。可勾选加入选题，或用 AI 扩展相关长尾词。"
    />
    <el-table
      v-loading="loading"
      :data="queries"
      size="small"
      stripe
      max-height="320"
      @selection-change="emit('selection-change', $event)"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column prop="query" label="搜索词" min-width="160" show-overflow-tooltip />
      <el-table-column prop="siteDomain" label="站点" width="120" show-overflow-tooltip />
      <el-table-column prop="impressions" label="展示" width="72" />
      <el-table-column prop="clicks" label="点击" width="72" />
      <el-table-column label="排名" width="72">
        <template #default="{ row }">{{ row.position.toFixed(1) }}</template>
      </el-table-column>
    </el-table>
    <el-empty
      v-if="!loading && queries.length === 0"
      description="暂无新搜索词；请先在「站点详情 → 搜索表现」同步数据"
    />
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button :disabled="selectedCount === 0" @click="emit('expand-seeds')">AI 扩展相关词</el-button>
      <el-button type="primary" :loading="importing" :disabled="selectedCount === 0" @click="emit('import')">
        加入词库{{ selectedCount > 0 ? `（${selectedCount}）` : "" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { GscDiscoveredQuery } from "@/api/seo-factory/keyword";

defineOptions({ name: "KeywordGscImportDialog" });

defineProps<{
  visible: boolean;
  loading: boolean;
  queries: GscDiscoveredQuery[];
  importing: boolean;
  selectedCount: number;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "selection-change": [rows: GscDiscoveredQuery[]];
  import: [];
  "expand-seeds": [];
}>();
</script>
