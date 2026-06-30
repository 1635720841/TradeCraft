<!--
  Provider 状态卡片（Console 系统健康）。
-->
<template>
  <el-card v-loading="loading" shadow="never">
    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-medium">Provider 状态</span>
        <el-button size="small" :loading="loading" @click="emit('refresh')">刷新</el-button>
      </div>
    </template>
    <el-table :data="providers" stripe>
      <el-table-column prop="name" label="名称" width="120" />
      <el-table-column label="状态" min-width="160">
        <template #default="{ row }">
          <el-tag :type="row.configured ? 'success' : 'info'" size="small">
            {{ row.configured ? "已配置" : "未配置/Stub" }}
          </el-tag>
          <span v-if="row.mode" class="ml-2 text-xs mw-text-muted">{{ row.mode }}</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import type { ProviderHealthItem } from "@/api/console/health";

defineOptions({ name: "ConsoleProviderStatusCard" });

defineProps<{
  loading: boolean;
  providers: ProviderHealthItem[];
}>();

const emit = defineEmits<{
  refresh: [];
}>();
</script>
