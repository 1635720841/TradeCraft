<!--
  工作流步骤条：任务详情/列表进度可视化。

  边界：
  - 不负责：轮询与数据拉取
-->
<template>
  <div v-if="steps.length" class="job-progress-stepper">
    <div v-if="compact" class="flex flex-wrap items-center gap-2 text-sm">
      <span v-if="headline" class="text-gray-700">{{ headline }}</span>
      <el-tag v-if="currentStep" size="small" type="primary">
        {{ currentStep.label }}
      </el-tag>
    </div>

    <el-steps v-else :active="activeIndex" :direction="direction" finish-status="success" :align-center="direction === 'horizontal'">
      <el-step
        v-for="step in steps"
        :key="step.key"
        :title="step.label"
        :description="step.state === 'current' ? step.estimate : undefined"
        :status="stepStatus(step)"
      />
    </el-steps>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import {
  buildJobProgressSteps,
  formatJobProgressHeadline,
  inferCurrentWorkflowStep
} from "@/utils/seo-factory/job-progress";

defineOptions({ name: "ArticleJobProgressStepper" });

const props = withDefaults(
  defineProps<{
    job: ArticleJobItem;
    compact?: boolean;
    direction?: "horizontal" | "vertical";
  }>(),
  { compact: false, direction: "horizontal" }
);

const steps = computed(() => buildJobProgressSteps(props.job));
const headline = computed(() => formatJobProgressHeadline(props.job));
const currentStep = computed(() => {
  const key = inferCurrentWorkflowStep(props.job);
  return steps.value.find((step) => step.key === key) ?? null;
});

const activeIndex = computed(() => {
  const current = inferCurrentWorkflowStep(props.job);
  if (!current) return steps.value.length;
  const index = steps.value.findIndex((step) => step.key === current);
  return index >= 0 ? index : 0;
});

function stepStatus(step: { state: string }) {
  if (step.state === "failed") return "error";
  if (step.state === "done") return "success";
  if (step.state === "current") return "process";
  return "wait";
}
</script>
