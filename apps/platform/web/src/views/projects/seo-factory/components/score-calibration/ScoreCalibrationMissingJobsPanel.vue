<!--
  缺 RPA 配对任务列表：引导补训练样本。

  边界：
  - 不负责：任务执行（跳转详情）
-->
<template>
  <el-card ref="cardRef" shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">缺配对任务</span>
        <span class="text-xs text-gray-400">跑完 Semrush 真检后自动纳入训练集</span>
      </div>
    </template>

    <el-table v-loading="loading" :data="rows" size="small" row-key="jobId" empty-text="所有运营任务均已有配对">
      <el-table-column prop="targetKeyword" label="关键词" min-width="160" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="localSeoScore" label="本地分" width="80">
        <template #default="{ row }">{{ row.localSeoScore ?? "—" }}</template>
      </el-table-column>
      <el-table-column prop="semrushScore" label="Semrush" width="80">
        <template #default="{ row }">{{ row.semrushScore ?? "—" }}</template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="160">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="emit('open-job', row.jobId)">任务</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > limit" class="mt-3 flex justify-end">
      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        layout="total, prev, pager, next"
        :total="total"
        @current-change="loadData"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { ElCard } from "element-plus";
import {
  listScoreCalibrationJobsWithoutPairs,
  type ScoreCalibrationJobWithoutPair
} from "@/api/seo-factory/score-calibration";

defineOptions({ name: "ScoreCalibrationMissingJobsPanel" });

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  "open-job": [jobId: string];
}>();

const cardRef = ref<InstanceType<typeof ElCard> | null>(null);
const loading = ref(false);
const rows = ref<ScoreCalibrationJobWithoutPair[]>([]);
const page = ref(1);
const limit = ref(10);
const total = ref(0);

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function loadData() {
  loading.value = true;
  try {
    const res = await listScoreCalibrationJobsWithoutPairs(props.projectId, {
      page: page.value,
      limit: limit.value
    });
    rows.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? rows.value.length;
  } finally {
    loading.value = false;
  }
}

function scrollIntoView() {
  cardRef.value?.$el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

defineExpose({ reload: loadData, scrollIntoView });

onMounted(() => {
  void loadData();
});
</script>
