<!--
  demo-factory 概览：只读演示项列表。
-->
<template>
  <div class="p-4">
    <AsyncErrorAlert :message="error" title="演示数据加载失败" @retry="loadItems" />
    <el-card v-loading="loading && !error" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">演示项</span>
          <el-button link type="primary" @click="loadItems">刷新</el-button>
        </div>
      </template>
      <el-table :data="items" stripe>
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !error && items.length === 0" description="暂无演示项" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";
import AsyncErrorAlert from "@/components/feedback/AsyncErrorAlert.vue";
import { runLoad } from "@/composables/run-load";

defineOptions({ name: "DemoOverviewView" });

interface DemoItemRow {
  id: string;
  title: string;
  createdAt: string;
}

const route = useRoute();
const projectId = route.params.projectId as string;
const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<DemoItemRow[]>([]);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadItems() {
  await runLoad(
    async () => {
      const res = await http.request<WmApiResponse<DemoItemRow[]>>(
        "get",
        `/api/v1/projects/${projectId}/demo-factory/items`
      );
      return res.data ?? [];
    },
    {
      setLoading: (value) => {
        loading.value = value;
      },
      setError: (value) => {
        error.value = value;
      },
      onSuccess: (data) => {
        items.value = data;
      },
      fallbackMessage: "演示数据加载失败"
    }
  );
}

onMounted(() => {
  void loadItems();
});
</script>
