<!--
  队列汇总卡片（Console 系统健康）。
-->
<template>
  <el-card v-loading="loading" shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">队列状态</span>
        <el-button size="small" :loading="loading" @click="emit('refresh')">刷新</el-button>
      </div>
    </template>
    <el-table :data="queues" stripe>
      <el-table-column prop="queueLabel" label="队列" min-width="140">
        <template #default="{ row }">
          <div>{{ row.queueLabel }}</div>
          <div class="text-xs mw-text-muted">{{ row.name }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="waiting" label="等待" width="90" />
      <el-table-column prop="active" label="执行中" width="90" />
      <el-table-column prop="failed" label="失败" width="90" />
      <el-table-column prop="delayed" label="延迟" width="90" />
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import type { QueueHealthItem } from "@/api/console/health";

defineOptions({ name: "ConsoleQueueStatusCard" });

defineProps<{
  loading: boolean;
  queues: Array<QueueHealthItem & { queueLabel?: string }>;
}>();

const emit = defineEmits<{ refresh: [] }>();
</script>
