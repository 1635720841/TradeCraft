/**
 * 将 HTTP RequestContext 注入 AsyncLocalStorage，供 Prisma 租户中间件读取。
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Observable as ObservableType } from 'rxjs';
import {
  readRequestContext,
  runWithRequestContext,
  type StoredRequestContext,
} from '../context/request-context.store';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): ObservableType<unknown> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const reqCtx = readRequestContext(request);
    if (!reqCtx) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      runWithRequestContext(reqCtx as StoredRequestContext, () => {
        const subscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
        return () => subscription.unsubscribe();
      });
    });
  }
}
