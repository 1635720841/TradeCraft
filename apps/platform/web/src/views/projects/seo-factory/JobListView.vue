<!--
  文章任务列表页：展示项目下所有生成任务，支持创建与查看详情。

  边界：
  - 不负责：工作流执行（后端 BullMQ）
-->
<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">文章任务</span>
          <div class="flex items-center gap-2">
            <el-tag v-if="polling" type="info" size="small">自动刷新中</el-tag>
            <el-button @click="goSites">站点管理</el-button>
            <el-button @click="() => fetchJobs()">刷新</el-button>
            <el-button type="primary" @click="goCreate">新建任务</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="jobs" stripe style="width: 100%">
        <el-table-column prop="targetKeyword" label="目标关键词" min-width="160" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="dictTagType(jobStatusDict, row.status)">
              {{ dictLabel(jobStatusDict, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span
              v-if="progressText(row)"
              class="text-sm text-gray-600"
            >
              {{ progressText(row) }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="本地预检" width="90">
          <template #default="{ row }">
            <el-tag
              v-if="row.localSeoScore != null"
              :type="row.localSeoScore >= LOCAL_SEO_PASS_THRESHOLD ? 'success' : 'warning'"
              size="small"
            >
              {{ row.localSeoScore }}
            </el-tag>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="semrushScore" label="Semrush" width="90">
          <template #default="{ row }">
            <el-tag
              v-if="row.semrushScore != null"
              :type="row.semrushScore >= SEMRUSH_PASS_THRESHOLD ? 'success' : 'warning'"
              size="small"
            >
              {{ row.semrushScore }}
            </el-tag>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.status === 'FAILED' && row.errorMessage" class="text-red-500 text-sm">
              {{ row.errorMessage }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="160">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.id)">详情</el-button>
            <el-button
              v-if="(row as ArticleJobItem).status === 'FAILED'"
              type="warning"
              link
              :loading="retryingId === (row as ArticleJobItem).id"
              @click="handleRetry((row as ArticleJobItem).id)"
            >
              续跑
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="() => fetchJobs()"
          @size-change="onSizeChange"
        />
      </div>

      <el-empty v-if="!loading && jobs.length === 0" description="暂无任务" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listArticleJobs, retryArticleJob } from "@/api/seo-factory/article-job";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { jobStatusDict, JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";
import { LOCAL_SEO_PASS_THRESHOLD, SEMRUSH_PASS_THRESHOLD } from "@/constants/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import {
  formatWorkflowProgressShort,
  workflowStepLabel
} from "@/utils/seo-factory/workflow-progress";

defineOptions({ name: "JobListView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const loading = ref(false);
const polling = ref(false);
const jobs = ref<ArticleJobItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const retryingId = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const hasActiveJobs = computed(() =>
  jobs.value.some(
    (job) => !JOB_TERMINAL_STATUSES.includes(job.status as (typeof JOB_TERMINAL_STATUSES)[number])
  )
);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function progressText(row: unknown): string | null {
  const item = row as ArticleJobItem;
  const progress = formatWorkflowProgressShort(item.seoCheckData?.workflowProgress);
  if (progress) return progress;
  if (item.status === "FAILED" && item.seoCheckData?.workflow?.failedStep) {
    return `失败于 ${workflowStepLabel(item.seoCheckData.workflow.failedStep)}，可续跑`;
  }
  return null;
}

async function fetchJobs(showLoading = true) {
  if (showLoading) loading.value = true;
  try {
    const res = await listArticleJobs(projectId, page.value, limit.value);
    jobs.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? jobs.value.length;
  } finally {
    if (showLoading) loading.value = false;
    syncPolling();
  }
}

function syncPolling() {
  if (hasActiveJobs.value) {
    startPolling();
  } else {
    stopPolling();
  }
}

function startPolling() {
  if (pollTimer) return;
  polling.value = true;
  pollTimer = setInterval(() => {
    if (hasActiveJobs.value) {
      void fetchJobs(false);
    }
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  polling.value = false;
}

function onSizeChange() {
  page.value = 1;
  void fetchJobs();
}

async function handleRetry(jobId: string) {
  retryingId.value = jobId;
  try {
    await retryArticleJob(projectId, jobId);
    message("已从失败步骤重新入队，正在续跑…", { type: "success" });
    await fetchJobs(false);
    startPolling();
  } finally {
    retryingId.value = null;
  }
}

function goCreate() {
  router.push({
    name: "SeoFactoryJobCreate",
    params: { projectId }
  });
}

function goDetail(jobId: string) {
  router.push({
    name: "SeoFactoryJobDetail",
    params: { projectId, jobId }
  });
}

function goSites() {
  router.push({
    name: "SeoFactorySites",
    params: { projectId }
  });
}

onMounted(() => {
  void fetchJobs();
});

onUnmounted(() => {
  stopPolling();
});
</script>
