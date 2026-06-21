<!--
  评分校准特征归因详情：12 维 value vs mean 与线性贡献。

  边界：
  - 不负责：模型训练
  - 不负责：配对列表分页
-->
<template>
  <div class="px-2 py-2">
    <div v-if="summaryLine" class="mb-2 text-xs text-gray-500">{{ summaryLine }}</div>
    <el-table v-if="drivers.length" :data="drivers" size="small" border max-height="360">
      <el-table-column prop="label" label="特征" min-width="100" />
      <el-table-column label="样本值" width="80">
        <template #default="{ row }">{{ row.featureValue }}</template>
      </el-table-column>
      <el-table-column label="训练均值" width="80">
        <template #default="{ row }">{{ row.meanValue }}</template>
      </el-table-column>
      <el-table-column label="偏离" width="80">
        <template #default="{ row }">
          <span :class="deviationClass(row)">{{ formatDeviation(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="贡献" width="80">
        <template #default="{ row }">
          <span :class="contributionClass(row)">{{ formatContribution(row.contribution) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="方向" width="70">
        <template #default="{ row }">
          {{ row.direction === "raises" ? "抬高" : "压低" }}
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="暂无归因数据（模型未就绪）" :image-size="48" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ScoreCalibrationFeatureDriver } from "@/api/seo-factory/score-calibration";

defineOptions({ name: "ScoreCalibrationFeatureAttributionPanel" });

const props = defineProps<{
  drivers: ScoreCalibrationFeatureDriver[];
  predictedSemrush?: number;
  semrushOverall?: number;
  signedModelError?: number | null;
}>();

const summaryLine = computed(() => {
  if (props.predictedSemrush === undefined || props.semrushOverall === undefined) return "";
  const signed =
    props.signedModelError !== null && props.signedModelError !== undefined
      ? props.signedModelError
      : Math.round((props.predictedSemrush - props.semrushOverall) * 100) / 100;
  return `预测 ${props.predictedSemrush} · Semrush ${props.semrushOverall} · 误差 ${signed >= 0 ? "+" : ""}${signed}（贡献 = 权重 × (样本值 − 训练均值)）`;
});

function formatDeviation(row: ScoreCalibrationFeatureDriver): string {
  const delta = Math.round((row.featureValue - row.meanValue) * 100) / 100;
  return delta >= 0 ? `+${delta}` : String(delta);
}

function formatContribution(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function deviationClass(row: ScoreCalibrationFeatureDriver): string {
  const delta = row.featureValue - row.meanValue;
  if (Math.abs(delta) < 0.05) return "text-gray-500";
  return delta > 0 ? "text-amber-600" : "text-blue-600";
}

function contributionClass(row: ScoreCalibrationFeatureDriver): string {
  return row.contribution >= 0 ? "text-green-600" : "text-red-600";
}
</script>
