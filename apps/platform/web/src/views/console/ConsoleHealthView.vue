<!--
  Console 系统健康：队列积压与 Provider 配置状态（管理端）。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loadingQueues" shadow="never">
      <template #header>
        <span class="font-medium">队列状态</span>
      </template>
      <el-table :data="queues" stripe>
        <el-table-column prop="name" label="队列" min-width="200" />
        <el-table-column prop="waiting" label="等待" width="90" />
        <el-table-column prop="active" label="执行中" width="90" />
        <el-table-column prop="failed" label="失败" width="90" />
        <el-table-column prop="delayed" label="延迟" width="90" />
      </el-table>
    </el-card>

    <el-card v-loading="loadingProviders" shadow="never">
      <template #header>
        <span class="font-medium">Provider 状态</span>
      </template>
      <el-table :data="providers" stripe>
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column label="状态" min-width="160">
          <template #default="{ row }">
            <el-tag :type="row.configured ? 'success' : 'info'" size="small">
              {{ row.configured ? "已配置" : "未配置/Stub" }}
            </el-tag>
            <span v-if="row.mode" class="ml-2 text-xs text-gray-500">{{ row.mode }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  getConsoleProviderHealth,
  getConsoleQueueHealth,
  type ProviderHealthItem,
  type QueueHealthItem
} from "@/api/console/health";

defineOptions({ name: "ConsoleHealthView" });

const loadingQueues = ref(false);
const loadingProviders = ref(false);
const queues = ref<QueueHealthItem[]>([]);
const providers = ref<ProviderHealthItem[]>([]);

async function load() {
  loadingQueues.value = true;
  loadingProviders.value = true;
  try {
    const [queueData, providerData] = await Promise.all([
      getConsoleQueueHealth(),
      getConsoleProviderHealth()
    ]);
    queues.value = queueData.queues ?? [];
    providers.value = providerData.providers ?? [];
  } finally {
    loadingQueues.value = false;
    loadingProviders.value = false;
  }
}

onMounted(() => void load());
</script>
