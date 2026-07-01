/**
 * 全局鉴权 Guard：校验 Bearer JWT，注入 RequestContext，校验 RBAC 与 permissions。
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  Role,
  hasAnyPermission,
  type OrganizationType,
} from '@wm/shared-core';
import { attachRequestContext, type StoredRequestContext } from '../context/request-context.store';
import { BYPASS_TENANT_SCOPE_KEY } from '../decorators/bypass-tenant-scope.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ForbiddenException, UnauthorizedException } from '../exceptions/auth.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { PrismaService } from '../database/prisma.service';
import { AuthTokenService } from '../../modules/auth/auth-token.service';
import { PermissionService } from '../../modules/access/permission.service';
import { isSubscriptionActive } from '../../modules/billing/subscription.util';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authTokenService: AuthTokenService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const claims = this.authTokenService.verifyAccessToken(token);
    const traceId = this.resolveTraceId(request);
    const role = claims.role as Role;

    const user = await this.prisma.user.findFirst({
      where: { id: claims.sub },
      select: { status: true },
    });
    if (!user) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '用户不存在或已被移除');
    }
    if (user.status === 'DISABLED') {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '账号已被停用');
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: claims.org },
      select: {
        type: true,
        status: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
      },
    });
    if (!org) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '企业不存在或已被移除');
    }

    const organizationType: OrganizationType =
      org.type === 'PLATFORM' ? 'PLATFORM' : 'CUSTOMER';
    const permissions = await this.permissionService.resolveUserPermissions(claims.sub, role);

    const path = request.path ?? request.url ?? '';
    const handlerBypass = this.reflector.getAllAndOverride<boolean>(BYPASS_TENANT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const bypassTenantScope = path.startsWith('/api/v1/console') || handlerBypass === true;

    const reqCtx: StoredRequestContext = {
      traceId,
      userId: claims.sub,
      organizationId: claims.org,
      organizationType,
      role,
      permissions,
      impersonatedBy: claims.impersonatedBy,
      bypassTenantScope,
    };

    attachRequestContext(request as unknown as Record<string, unknown>, reqCtx);

    if (
      role !== Role.SUPER_ADMIN &&
      role !== Role.PLATFORM_OPERATOR &&
      org.type === 'CUSTOMER'
    ) {
      if (org.status === 'SUSPENDED' || org.status === 'CLOSED') {
        throw new ForbiddenException(ErrorCodes.ORG_SUSPENDED, '企业已被暂停或关闭');
      }
      if (!isSubscriptionActive(org.subscriptionStatus, org.currentPeriodEnd)) {
        throw new ForbiddenException(
          ErrorCodes.ORG_SUBSCRIPTION_EXPIRED,
          '企业有效期已过，请联系平台续期',
        );
      }
    }

    if (role !== Role.SUPER_ADMIN) {
      const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (requiredRoles?.length && !requiredRoles.includes(reqCtx.role)) {
        throw new ForbiddenException(ErrorCodes.FORBIDDEN, '无权执行此操作');
      }
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredPermissions?.length && role !== Role.SUPER_ADMIN) {
      if (!hasAnyPermission(permissions, requiredPermissions)) {
        throw new ForbiddenException(ErrorCodes.FORBIDDEN, '缺少所需权限');
      }
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
