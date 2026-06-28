/**
 * HTTP 请求上下文存储：AuthGuard 写入，Controller 通过 @ReqCtx() 读取；
 * AsyncLocalStorage 供 Prisma 租户中间件使用。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '@wm/shared-core';

export const REQUEST_CONTEXT_KEY = '__wmRequestContext';

export type StoredRequestContext = RequestContext & {
  bypassTenantScope?: boolean;
  impersonatedBy?: string;
};

const storage = new AsyncLocalStorage<StoredRequestContext>();

export function attachRequestContext(
  request: Record<string, unknown>,
  context: StoredRequestContext,
): void {
  request[REQUEST_CONTEXT_KEY] = context;
}

export function readRequestContext(
  request: Record<string, unknown>,
): StoredRequestContext | undefined {
  const value = request[REQUEST_CONTEXT_KEY];
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as StoredRequestContext;
}

export function runWithRequestContext<T>(ctx: StoredRequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): StoredRequestContext | undefined {
  return storage.getStore();
}
