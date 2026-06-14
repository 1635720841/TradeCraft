/**
 * 从当前 HTTP 请求注入 RequestContext（须先经过 AuthGuard）。
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { readRequestContext } from '../context/request-context.store';

export const ReqCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    const context = readRequestContext(request);
    if (!context) {
      throw new Error('RequestContext 未初始化，请确认 AuthGuard 已启用');
    }
    return context;
  },
);
