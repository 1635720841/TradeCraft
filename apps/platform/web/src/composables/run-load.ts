/**
 * 列表/分页 composable 共用的加载错误处理（失败时保留上次数据）。
 */

import { type Ref } from "vue";
import { extractErrorMessage } from "@/utils/error-message";

export interface RunLoadOptions<T> {
  setLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
  onSuccess: (result: T) => void;
  showLoading?: boolean;
  fallbackMessage?: string;
}

export async function runLoad<T>(
  fn: () => Promise<T>,
  options: RunLoadOptions<T>
): Promise<boolean> {
  const showLoading = options.showLoading !== false;
  if (showLoading) options.setLoading(true);
  options.setError(null);
  try {
    const result = await fn();
    options.onSuccess(result);
    return true;
  } catch (error) {
    options.setError(extractErrorMessage(error, options.fallbackMessage));
    return false;
  } finally {
    if (showLoading) options.setLoading(false);
  }
}

export function createLoadRunner(errorRef: Ref<string | null>) {
  return async function run<T>(
    fn: () => Promise<T>,
    options: Omit<RunLoadOptions<T>, "setError"> & { setLoading: (value: boolean) => void }
  ): Promise<boolean> {
    return runLoad(fn, { ...options, setError: (value) => { errorRef.value = value; } });
  };
}
