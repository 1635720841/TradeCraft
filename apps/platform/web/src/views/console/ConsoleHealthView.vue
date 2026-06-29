<!--
  Console 系统健康：队列积压与排队任务明细（管理端）。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loadingQueues" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">队列状态</span>
          <el-button size="small" :loading="loadingQueues" @click="loadQueues">刷新</el-button>
        </div>
      </template>
      <el-table :data="queues" stripe>
        <el-table-column prop="queueLabel" label="队列" min-width="140">
          <template #default="{ row }">
            <div>{{ row.queueLabel }}</div>
            <div class="text-xs text-gray-500">{{ row.name }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="waiting" label="等待" width="90" />
        <el-table-column prop="active" label="执行中" width="90" />
        <el-table-column prop="failed" label="失败" width="90" />
        <el-table-column prop="delayed" label="延迟" width="90" />
      </el-table>
    </el-card>

    <el-card v-loading="loadingJobs" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="font-medium">排队任务明细</span>
            <span class="ml-2 text-xs text-gray-500">文章生成与 Semrush RPA 队列</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <el-select v-model="jobState" size="small" style="width: 120px" @change="loadJobs">
              <el-option label="等待+执行" value="all" />
              <el-option label="仅等待" value="waiting" />
              <el-option label="仅执行中" value="active" />
              <el-option label="延迟" value="delayed" />
            </el-select>
            <el-select
              v-model="jobQueue"
              clearable
              size="small"
              placeholder="全部队列"
              style="width: 160px"
              @change="loadJobs"
            >
              <el-option label="文章生成" value="seo-factory-article-job" />
              <el-option label="Semrush RPA" value="seo-factory-playwright" />
            </el-select>
            <el-button size="small" :loading="loadingJobs" @click="loadJobs">刷新</el-button>
          </div>
        </div>
      </template>

      <el-empty
        v-if="!loadingJobs && queueJobs.length === 0"
        description="当前无排队或执行中的文章任务"
        :image-size="72"
      />

      <el-table v-else :data="queueJobs" stripe>
        <el-table-column label="队列" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.queue === 'seo-factory-playwright' ? 'warning' : 'info'">
              {{ row.queueLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="stateTagType(row.state)">
              {{ stateLabel(row.state) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="排位" width="70">
          <template #default="{ row }">
            {{ row.position ?? "—" }}
          </template>
        </el-table-column>
        <el-table-column prop="targetKeyword" label="关键词" min-width="160">
          <template #default="{ row }">
            {{ row.targetKeyword || "—" }}
          </template>
        </el-table-column>
        <el-table-column prop="organizationName" label="租户" min-width="120">
          <template #default="{ row }">
            {{ row.organizationName || row.organizationId }}
          </template>
        </el-table-column>
        <el-table-column label="任务状态" width="110">
          <template #default="{ row }">
            {{ row.articleStatus || "—" }}
          </template>
        </el-table-column>
        <el-table-column label="阶段" width="120">
          <template #default="{ row }">
            <span v-if="row.workflowPhase">{{ row.workflowPhase }}</span>
            <span v-else-if="row.resumeFrom">续跑 {{ row.resumeFrom }}</span>
            <span v-else>—</span>
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
              @click="openJob(row as ConsoleQueueJobItem)"
            >
              查看
            </el-button>
          </template>
        </el-table-column>
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
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  getConsoleProviderHealth,
  getConsoleQueueHealth,
  getConsoleQueueJobs,
  type ConsoleQueueJobItem,
  type ProviderHealthItem,
  type QueueHealthItem
} from "@/api/console/health";

defineOptions({ name: "ConsoleHealthView" });

const router = useRouter();
const loadingQueues = ref(false);
const loadingJobs = ref(false);
const loadingProviders = ref(false);
const queues = ref<Array<QueueHealthItem & { queueLabel?: string }>>([]);
const queueJobs = ref<ConsoleQueueJobItem[]>([]);
const providers = ref<ProviderHealthItem[]>([]);
const jobState = ref<"waiting" | "active" | "delayed" | "all">("all");
const jobQueue = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

const QUEUE_LABELS: Record<string, string> = {
  "seo-factory-article-job": "文章生成",
  "seo-factory-playwright": "Semrush RPA",
  "seo-factory-gsc-sync": "GSC 同步"
};

function stateLabel(state: string) {
  if (state === "waiting") return "等待";
  if (state === "active") return "执行中";
  if (state === "delayed") return "延迟";
  return state;
}

function stateTagType(state: string): "info" | "success" | "warning" {
  if (state === "active") return "success";
  if (state === "waiting") return "warning";
  return "info";
}

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

async function loadQueues() {
  loadingQueues.value = true;
  try {
    const queueData = await getConsoleQueueHealth();
    queues.value = (queueData.queues ?? []).map((item) => ({
      ...item,
      queueLabel: QUEUE_LABELS[item.name] ?? item.name
    }));
  } finally {
    loadingQueues.value = false;
  }
}

async function loadJobs() {
  loadingJobs.value = true;
  try {
    const data = await getConsoleQueueJobs({
      state: jobState.value,
      queue: jobQueue.value || undefined,
      limit: 100
    });
    queueJobs.value = data.items ?? [];
  } finally {
    loadingJobs.value = false;
  }
}

async function loadProviders() {
  loadingProviders.value = true;
  try {
    const providerData = await getConsoleProviderHealth();
    providers.value = providerData.providers ?? [];
  } finally {
    loadingProviders.value = false;
  }
}

async function load() {
  await Promise.all([loadQueues(), loadJobs(), loadProviders()]);
}

function openJob(row: ConsoleQueueJobItem) {
  const route = router.resolve({
    name: "SeoFactoryJobDetail",
    params: { projectId: row.projectId, jobId: row.jobId }
  });
  window.open(route.href, "_blank");
}

onMounted(() => {
  void load();
  pollTimer = setInterval(() => {
    void loadQueues();
    void loadJobs();
  }, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
