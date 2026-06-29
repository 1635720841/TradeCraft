<!--
  文章任务活动流时间线。
-->
<template>
  <div v-loading="loading" class="space-y-2">
    <div v-if="!items.length && !loading" class="text-sm text-gray-400">暂无活动记录</div>
    <div
      v-for="item in items"
      :key="item.id"
      class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
    >
      <div class="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
        <span>{{ item.actor?.name || item.actor?.email || "用户" }}</span>
        <span>·</span>
        <span>{{ formatTime(item.createdAt) }}</span>
      </div>
      <div class="mt-0.5">{{ item.summary }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { listJobActivity, type JobActivityItem } from "@/api/seo-factory/article-job-activity";

const props = defineProps<{
  projectId: string;
  jobId: string;
}>();

const loading = ref(false);
const items = ref<JobActivityItem[]>([]);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function refresh() {
  loading.value = true;
  try {
    items.value = await listJobActivity(props.projectId, props.jobId);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.projectId, props.jobId],
  () => void refresh(),
  { immediate: true }
);

defineExpose({ refresh });
</script>
