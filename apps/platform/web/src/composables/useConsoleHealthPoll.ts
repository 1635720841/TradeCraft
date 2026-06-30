/**
 * Console 健康页：队列与 Provider 轮询加载。
 */

import { onMounted, onUnmounted, ref } from "vue";
import {
  getConsoleProviderHealth,
  getConsoleQueueHealth,
  getConsoleQueueJobs,
  type ConsoleQueueJobItem,
  type ProviderHealthItem,
  type QueueHealthItem
} from "@/api/console/health";
import { consoleQueueDict } from "@/constants/dicts/platform";
import { dictLabel } from "@/utils/dict";

const POLL_INTERVAL_MS = 15000;

export function useConsoleHealthPoll() {
  const loadingQueues = ref(false);
  const loadingJobs = ref(false);
  const loadingProviders = ref(false);
  const queues = ref<Array<QueueHealthItem & { queueLabel?: string }>>([]);
  const queueJobs = ref<ConsoleQueueJobItem[]>([]);
  const providers = ref<ProviderHealthItem[]>([]);
  const jobState = ref<"waiting" | "active" | "delayed" | "failed" | "all">("all");
  const jobQueue = ref("");

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadQueues() {
    loadingQueues.value = true;
    try {
      const queueData = await getConsoleQueueHealth();
      queues.value = (queueData.queues ?? []).map((item) => ({
        ...item,
        queueLabel: dictLabel(consoleQueueDict, item.name) || item.name
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

  async function loadAll() {
    await Promise.all([loadQueues(), loadJobs(), loadProviders()]);
  }

  function startPolling() {
    pollTimer = setInterval(() => {
      void loadQueues();
      void loadJobs();
      void loadProviders();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMounted(() => {
    void loadAll();
    startPolling();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return {
    loadingQueues,
    loadingJobs,
    loadingProviders,
    queues,
    queueJobs,
    providers,
    jobState,
    jobQueue,
    loadQueues,
    loadJobs,
    loadProviders,
    loadAll
  };
}
