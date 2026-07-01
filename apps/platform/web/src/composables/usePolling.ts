/**
 * 通用轮询：页面隐藏时暂停，卸载时清理。
 */

import { onUnmounted, ref } from "vue";

export function usePolling(options: {
  fetcher: () => Promise<void>;
  shouldContinue: () => boolean;
  intervalMs?: number;
}) {
  const polling = ref(false);
  const intervalMs = options.intervalMs ?? 3000;
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    polling.value = false;
  }

  async function tick() {
    if (document.hidden) return;
    await options.fetcher();
    if (!options.shouldContinue()) {
      stopPolling();
    }
  }

  function startPolling() {
    stopPolling();
    if (!options.shouldContinue()) return;
    polling.value = true;
    void tick();
    timer = setInterval(() => {
      void tick();
    }, intervalMs);
  }

  onUnmounted(() => {
    stopPolling();
  });

  return { polling, startPolling, stopPolling, tick };
}
