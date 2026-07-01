/**
 * Console 健康页：队列与 Provider 轮询加载。
 */

import { computed, onMounted, onUnmounted, ref } from "vue";
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

function extractErrorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: string }).message)
    : "加载失败，请稍后重试";
}

export function useConsoleHealthPoll() {
  const loadingQueues = ref(false);
  const loadingJobs = ref(false);
  const loadingProviders = ref(false);
  const loadError = ref<string | null>(null);
  const queues = ref<Array<QueueHealthItem & { queueLabel?: string }>>([]);
  const queueJobs = ref<ConsoleQueueJobItem[]>([]);
  const providers = ref<ProviderHealthItem[]>([]);
  const jobState = ref<"waiting" | "active" | "delayed" | "failed" | "all">("all");
  const jobQueue = ref("");

  const loading = computed(
    () => loadingQueues.value || loadingJobs.value || loadingProviders.value
  );

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadQueues() {
    loadingQueues.value = true;
    try {
      const queueData = await getConsoleQueueHealth();
      queues.value = (queueData.queues ?? []).map((item) => ({
        ...item,
        queueLabel: dictLabel(consoleQueueDict, item.name) || item.name
      }));
    } catch (error) {
      loadError.value = extractErrorMessage(error);
      throw error;
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
    } catch (error) {
      loadError.value = extractErrorMessage(error);
      throw error;
    } finally {
      loadingJobs.value = false;
    }
  }

  async function loadProviders() {
    loadingProviders.value = true;
    try {
      const providerData = await getConsoleProviderHealth();
      providers.value = providerData.providers ?? [];
    } catch (error) {
      loadError.value = extractErrorMessage(error);
      throw error;
    } finally {
      loadingProviders.value = false;
    }
  }

  async function loadAll() {
    loadError.value = null;
    const results = await Promise.allSettled([loadQueues(), loadJobs(), loadProviders()]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      loadError.value = extractErrorMessage(failed.reason);
    }
  }

  async function retry() {
    await loadAll();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      void loadAll();
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
    loadAll,
    retry
  };
}
