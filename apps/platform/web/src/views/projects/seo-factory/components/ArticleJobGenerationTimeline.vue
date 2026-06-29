<!--
  任务生成时间线：工作流步骤 + 关键事件。

  边界：
  - 不负责：轮询与数据拉取
-->
<template>
  <div class="job-generation-timeline">
    <button
      v-if="collapsible && job.status === 'COMPLETED'"
      type="button"
      class="job-generation-timeline__collapse-trigger"
      @click="expanded = !expanded"
    >
      <IconifyIconOnline :icon="expanded ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'" />
      已完成 · {{ completedCount }} / {{ totalSteps }} 步
    </button>

    <el-timeline v-show="showTimeline">
      <el-timeline-item
        v-for="entry in displayEntries"
        :key="entry.id"
        :type="timelineType(entry.state)"
        :hollow="entry.state === 'pending'"
      >
        <div class="job-generation-timeline__item" :class="`is-${entry.state}`">
          <strong>{{ entry.title }}</strong>
          <span v-if="entry.description" class="job-generation-timeline__desc">{{ entry.description }}</span>
          <time v-if="entry.timestamp" class="job-generation-timeline__time">
            {{ formatTime(entry.timestamp) }}
          </time>
        </div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import type { JobActivityItem } from "@/api/seo-factory/article-job-activity";
import {
  buildJobGenerationTimeline,
  countCompletedSteps,
  type GenerationTimelineEntry
} from "@/utils/seo-factory/job-generation-timeline";
import { buildJobProgressSteps } from "@/utils/seo-factory/job-progress";

defineOptions({ name: "ArticleJobGenerationTimeline" });

const props = withDefaults(
  defineProps<{
    job: ArticleJobItem;
    activityItems?: JobActivityItem[];
    collapsible?: boolean;
    stepsOnly?: boolean;
  }>(),
  { activityItems: () => [], collapsible: true, stepsOnly: false }
);

const expanded = ref(false);

const allEntries = computed(() =>
  buildJobGenerationTimeline(props.job, props.activityItems)
);

const stepEntries = computed(() => allEntries.value.filter((e) => e.kind === "step"));

const displayEntries = computed(() => {
  if (props.job.status !== "COMPLETED") {
    return stepEntries.value;
  }
  if (props.stepsOnly) return stepEntries.value;
  if (props.collapsible && !expanded.value) {
    return [];
  }
  return allEntries.value.filter((e) => e.kind === "step" || e.timestamp);
});

const completedCount = computed(() => countCompletedSteps(props.job));
const totalSteps = computed(() => buildJobProgressSteps(props.job).length);

const showTimeline = computed(() => {
  if (props.job.status !== "COMPLETED") return true;
  if (!props.collapsible) return displayEntries.value.length > 0;
  return expanded.value && displayEntries.value.length > 0;
});

function timelineType(state: GenerationTimelineEntry["state"]) {
  if (state === "failed") return "danger";
  if (state === "current") return "primary";
  if (state === "done") return "success";
  return "info";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}
</script>
