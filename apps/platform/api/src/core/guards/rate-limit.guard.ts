/**
 * 全局限流 Guard：Authenticated 请求按 organizationId 计数（Redis 固定窗口）。
 *
 * 边界：
 * - 不负责：登录鉴权（AuthGuard，须先于本 Guard 执行）
 *
 * 入口：
 * - RateLimitGuard
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { readRequestContext } from '../context/request-context.store';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_RATE_LIMIT_KEY } from '../decorators/skip-rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const reqCtx = readRequestContext(request as unknown as Record<string, unknown>);
    if (!reqCtx?.organizationId) {
      return true;
    }

    await this.rateLimitService.assertWithinOrgLimit(reqCtx.organizationId);
    return true;
  }
}
