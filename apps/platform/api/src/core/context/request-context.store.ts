/**
 * HTTP 请求上下文存储：AuthGuard 写入，Controller 通过 @ReqCtx() 读取。
 *
 * 边界：
 * - 不负责：JWT 解析（AuthGuard / AuthService）
 */

import type { RequestContext } from '@wm/shared-core';

export const REQUEST_CONTEXT_KEY = '__wmRequestContext';

export function attachRequestContext(
  request: Record<string, unknown>,
  context: RequestContext,
): void {
  request[REQUEST_CONTEXT_KEY] = context;
}

export function readRequestContext(request: Record<string, unknown>): RequestContext | undefined {
  const value = request[REQUEST_CONTEXT_KEY];
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as RequestContext;
}
