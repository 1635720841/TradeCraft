/**
 * 统一异步数据三态：loading / data / error，供管理端页面复用。
 */

import { ref, type Ref } from "vue";
import { extractErrorMessage } from "@/utils/error-message";

export interface UseAsyncDataOptions<T> {
  /** 无数据时是否算 empty（默认 data 为 null/undefined 或数组长度为 0） */
  isEmpty?: (data: T | null) => boolean;
}

export interface UseAsyncDataReturn<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  options: UseAsyncDataOptions<T> = {}
): UseAsyncDataReturn<T> & { isEmpty: Ref<boolean> } {
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<string | null>(null);
  const isEmpty = ref(false);

  function checkEmpty(value: T | null) {
    if (options.isEmpty) {
      isEmpty.value = options.isEmpty(value);
      return;
    }
    if (value == null) {
      isEmpty.value = true;
      return;
    }
    if (Array.isArray(value)) {
      isEmpty.value = value.length === 0;
      return;
    }
    isEmpty.value = false;
  }

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const result = await fetcher();
      data.value = result;
      checkEmpty(result);
    } catch (e) {
      data.value = null;
      isEmpty.value = false;
      error.value = extractErrorMessage(e);
    } finally {
      loading.value = false;
    }
  }

  async function retry() {
    await load();
  }

  return { data, loading, error, isEmpty, load, retry };
}
