/**
 * Semrush RPA 中止上下文：在 checkScore 调用栈内传播 articleJobId 与 shouldAbort。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { SemrushAbortSignalError } from './semrush-work-abort.util';

export interface SemrushAbortContextStore {
  articleJobId: string;
  shouldAbort: () => Promise<boolean>;
}

export const semrushAbortContext = new AsyncLocalStorage<SemrushAbortContextStore>();

export async function assertSemrushNotAbortedInContext(): Promise<void> {
  const store = semrushAbortContext.getStore();
  if (!store) return;
  if (await store.shouldAbort()) {
    throw new SemrushAbortSignalError();
  }
}
