/**
 * 文章任务状态轮询：终态（COMPLETED/FAILED）或组件卸载时自动停止。
 */

import { onUnmounted, ref, watch, type MaybeRefOrGetter, toValue } from "vue";
import { getArticleJob } from "@/api/seo-factory/article-job";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";

const DEFAULT_INTERVAL_MS = 3000;

export function useArticleJobPolling(
  projectId: MaybeRefOrGetter<string>,
  jobId: MaybeRefOrGetter<string | undefined>,
  intervalMs = DEFAULT_INTERVAL_MS
) {
  const job = ref<ArticleJobItem | null>(null);
  const loading = ref(false);
  const polling = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    polling.value = false;
  }

  async function fetchOnce() {
    const pid = toValue(projectId);
    const id = toValue(jobId);
    if (!pid || !id) return;

    loading.value = true;
    try {
      job.value = await getArticleJob(pid, id);
      const hasRewritePending = Boolean(job.value.draftData?.rewritePending);
      const isTerminal = JOB_TERMINAL_STATUSES.includes(
        job.value.status as (typeof JOB_TERMINAL_STATUSES)[number]
      );
      if (isTerminal && !hasRewritePending) {
        stopPolling();
      }
    } finally {
      loading.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    const id = toValue(jobId);
    if (!id) return;

    polling.value = true;
    void fetchOnce();
    timer = setInterval(() => {
      void fetchOnce();
    }, intervalMs);
  }

  watch(
    () => [toValue(projectId), toValue(jobId)] as const,
    ([pid, id]) => {
      stopPolling();
      job.value = null;
      if (pid && id) {
        startPolling();
      }
    },
    { immediate: true }
  );

  onUnmounted(() => {
    stopPolling();
  });

  return { job, loading, polling, fetchOnce, startPolling, stopPolling };
}
