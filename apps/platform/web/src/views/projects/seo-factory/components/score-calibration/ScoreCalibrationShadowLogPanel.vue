<!--
  影子日志：优化轮校准预测 vs Semrush 真分。

  边界：
  - 不负责：写入影子（M6 运行时）
-->
<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">影子日志</span>
        <span class="text-xs text-gray-400">预测与真分对比，按误差降序</span>
        <el-button size="small" :loading="loading" @click="loadData">刷新</el-button>
      </div>
    </template>

    <el-table v-loading="loading" :data="rows" size="small" row-key="id" empty-text="暂无影子记录（需在设置中开启影子日志）">
      <el-table-column prop="targetKeyword" label="关键词" min-width="140" show-overflow-tooltip />
      <el-table-column label="阶段" width="90">
        <template #default="{ row }">{{ phaseLabel(row.phase) }}</template>
      </el-table-column>
      <el-table-column prop="predictedSemrush" label="预测" width="70" />
      <el-table-column prop="actualSemrush" label="真分" width="70">
        <template #default="{ row }">{{ row.actualSemrush ?? "—" }}</template>
      </el-table-column>
      <el-table-column prop="absError" label="误差" width="70">
        <template #default="{ row }">{{ row.absError ?? "—" }}</template>
      </el-table-column>
      <el-table-column label="置信度" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="dictTagType(scoreCalibrationConfidenceDict, row.confidence)">
            {{ dictLabel(scoreCalibrationConfidenceDict, row.confidence) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="RPA" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.rpaSkipped" size="small" type="warning">跳过</el-tag>
          <span v-else class="text-gray-400">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="at" label="时间" width="160">
        <template #default="{ row }">{{ formatTime(row.at) }}</template>
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
import {
  listScoreCalibrationShadowLogs,
  type ScoreCalibrationShadowLogItem
} from "@/api/seo-factory/score-calibration";
import { scoreCalibrationConfidenceDict } from "@/constants/dicts/score-calibration";
import { dictLabel, dictTagType } from "@/utils/dict";

defineOptions({ name: "ScoreCalibrationShadowLogPanel" });

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  "open-job": [jobId: string];
}>();

const loading = ref(false);
const rows = ref<ScoreCalibrationShadowLogItem[]>([]);
const page = ref(1);
const limit = ref(15);
const total = ref(0);

function phaseLabel(phase: string): string {
  if (phase === "pre_rpa") return "RPA 前";
  if (phase === "post_rpa") return "RPA 后";
  if (phase === "rpa_skipped") return "已跳过";
  return phase;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function loadData() {
  loading.value = true;
  try {
    const res = await listScoreCalibrationShadowLogs(props.projectId, {
      page: page.value,
      limit: limit.value
    });
    rows.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? rows.value.length;
  } finally {
    loading.value = false;
  }
}

defineExpose({ reload: loadData });

onMounted(() => {
  void loadData();
});
</script>
