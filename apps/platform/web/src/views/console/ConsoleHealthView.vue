<!--
  Console 系统健康：队列积压与排队任务明细（管理端）。
-->
<template>
  <div class="p-4 space-y-4">
    <ConsoleQueueStatusCard
      :loading="loadingQueues"
      :queues="queues"
      @refresh="loadQueues"
    />

    <ConsoleQueueJobsCard
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
      :loading="loadingProviders"
      :providers="providers"
      @refresh="loadProviders"
    />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import type { ConsoleQueueJobItem } from "@/api/console/health";
import { useConsoleHealthPoll } from "@/composables/useConsoleHealthPoll";
import ConsoleProviderStatusCard from "./components/ConsoleProviderStatusCard.vue";
import ConsoleQueueJobsCard from "./components/ConsoleQueueJobsCard.vue";
import ConsoleQueueStatusCard from "./components/ConsoleQueueStatusCard.vue";

defineOptions({ name: "ConsoleHealthView" });

const router = useRouter();
const {
  loadingQueues,
  loadingJobs,
  loadingProviders,
  queues,
  queueJobs,
  providers,
  jobState,
  jobQueue,
  loadQueues,
  loadJobs
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
