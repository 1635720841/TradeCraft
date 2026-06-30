<!--
  排队任务明细卡片（Console 系统健康）。
-->
<template>
  <el-card v-loading="loading" shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="font-medium">排队任务明细</span>
          <span class="ml-2 text-xs mw-text-muted">文章生成、Semrush RPA 与 GSC 同步</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <el-select v-model="stateModel" size="small" style="width: 120px" @change="emit('filter-change')">
            <el-option
              v-for="opt in stateOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-select
            v-model="queueModel"
            clearable
            size="small"
            placeholder="全部队列"
            style="width: 160px"
            @change="emit('filter-change')"
          >
            <el-option
              v-for="opt in queueOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-button size="small" :loading="loading" @click="emit('refresh')">刷新</el-button>
        </div>
      </div>
    </template>

    <el-empty
      v-if="!loading && jobs.length === 0"
      description="当前无排队或执行中的任务"
      :image-size="72"
    />

    <el-table v-else :data="jobs" stripe>
      <el-table-column label="队列" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="dictTagType(consoleQueueDict, row.queue) ?? 'info'">
            {{ row.queueLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="dictTagType(queueJobStateDict, row.state) ?? 'info'">
            {{ dictLabel(queueJobStateDict, row.state) || row.state }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="关键词/任务" min-width="160">
        <template #default="{ row }">
          {{ row.targetKeyword || row.jobName || "—" }}
        </template>
      </el-table-column>
      <el-table-column label="租户" min-width="120">
        <template #default="{ row }">
          {{ row.organizationName || row.organizationId || "—" }}
        </template>
      </el-table-column>
      <el-table-column label="进度" min-width="120">
        <template #default="{ row }">
          {{ progressLabel(row) }}
        </template>
      </el-table-column>
      <el-table-column label="入队时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.enqueuedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.projectId && row.jobId"
            type="primary"
            link
            @click="emit('open-job', row)"
          >
            查看
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ConsoleQueueJobItem } from "@/api/console/health";
import { consoleQueueDict, queueJobStateDict } from "@/constants/dicts/platform";
import { jobStatusDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictOptions, dictTagType } from "@/utils/dict";

defineOptions({ name: "ConsoleQueueJobsCard" });

const props = defineProps<{
  loading: boolean;
  jobs: ConsoleQueueJobItem[];
  jobState: "waiting" | "active" | "delayed" | "failed" | "all";
  jobQueue: string;
}>();

const emit = defineEmits<{
  refresh: [];
  "filter-change": [];
  "open-job": [row: ConsoleQueueJobItem];
  "update:jobState": [value: "waiting" | "active" | "delayed" | "failed" | "all"];
  "update:jobQueue": [value: string];
}>();

const stateOptions = dictOptions(queueJobStateDict);
const queueOptions = dictOptions(consoleQueueDict);

const stateModel = computed({
  get: () => props.jobState,
  set: (value) => emit("update:jobState", value)
});

const queueModel = computed({
  get: () => props.jobQueue,
  set: (value) => emit("update:jobQueue", value)
});

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function progressLabel(row: ConsoleQueueJobItem) {
  if (row.workflowPhase) return row.workflowPhase;
  if (row.resumeFrom) return `续跑 ${row.resumeFrom}`;
  if (row.articleStatus) return dictLabel(jobStatusDict, row.articleStatus) || row.articleStatus;
  return "—";
}
</script>
