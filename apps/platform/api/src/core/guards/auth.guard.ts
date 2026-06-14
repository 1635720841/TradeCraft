/**
 * 全局鉴权 Guard：校验 Bearer JWT，注入 RequestContext，校验 RBAC。
 *
 * 边界：
 * - 不负责：登录签发（AuthService）
 *
 * 入口：
 * - AuthGuard
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Role, type RequestContext } from '@wm/shared-core';
import { attachRequestContext } from '../context/request-context.store';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ForbiddenException, UnauthorizedException } from '../exceptions/auth.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { JwtTokenService } from '../../modules/auth/jwt-token.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '请先登录');
    }

    const claims = this.jwtTokenService.verifyAccessToken(token);
    const traceId = this.resolveTraceId(request);

    const reqCtx: RequestContext = {
      traceId,
      userId: claims.sub,
      organizationId: claims.org,
      role: claims.role as Role,
    };

    attachRequestContext(request as unknown as Record<string, unknown>, reqCtx);

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.includes(reqCtx.role)) {
      throw new ForbiddenException(ErrorCodes.FORBIDDEN, '无权执行此操作');
    }

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }

  private resolveTraceId(request: Request): string {
    const header = request.headers['x-trace-id'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    return `tr_${uuidv4()}`;
  }
}
