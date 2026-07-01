<!--
  Console 系统健康：队列积压与排队任务明细（管理端）。
-->
<template>
  <AdminPageShell title="系统健康" description="队列积压、任务明细与外部 Provider 状态。">
    <template #actions>
      <el-button link type="primary" :loading="loading" @click="retry">刷新</el-button>
    </template>

    <el-alert
      v-if="loadError"
      type="error"
      :title="loadError"
      show-icon
      class="mb-4"
    >
      <template #default>
        <el-button type="primary" link @click="retry">重试</el-button>
      </template>
    </el-alert>

    <ConsoleQueueStatusCard
      :loading="loadingQueues"
      :queues="queues"
      @refresh="loadQueues"
    />

    <ConsoleQueueJobsCard
      class="mt-4"
      :loading="loadingJobs"
      :jobs="queueJobs"
      :job-state="jobState"
      :job-queue="jobQueue"
      @refresh="loadJobs"
      @filter-change="loadJobs"
      @open-job="openJob"
      @update:job-state="jobState = $event"
      @update:job-queue="jobQueue = $event"
    />

    <ConsoleProviderStatusCard
      class="mt-4"
      :loading="loadingProviders"
      :providers="providers"
      @refresh="loadProviders"
    />
  </AdminPageShell>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import AdminPageShell from "@/components/layout/AdminPageShell.vue";
import type { ConsoleQueueJobItem } from "@/api/console/health";
import { useConsoleHealthPoll } from "@/composables/useConsoleHealthPoll";
import ConsoleProviderStatusCard from "./components/ConsoleProviderStatusCard.vue";
import ConsoleQueueJobsCard from "./components/ConsoleQueueJobsCard.vue";
import ConsoleQueueStatusCard from "./components/ConsoleQueueStatusCard.vue";

defineOptions({ name: "ConsoleHealthView" });

const router = useRouter();
const {
  loading,
  loadingQueues,
  loadingJobs,
  loadingProviders,
  loadError,
  queues,
  queueJobs,
  providers,
  jobState,
  jobQueue,
  loadQueues,
  loadJobs,
  loadProviders,
  retry
} = useConsoleHealthPoll();

function openJob(row: ConsoleQueueJobItem) {
  if (!row.projectId || !row.jobId) return;
  const route = router.resolve({
    name: "SeoFactoryJobDetail",
    params: { projectId: row.projectId, jobId: row.jobId }
  });
  window.open(route.href, "_blank");
}
</script>
