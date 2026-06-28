/**
 * 统一权限读写（租户内 / 超管跨租户）。
 */

import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { PermissionService } from './permission.service';

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async getUserPermissions(userId: string, organizationScopeId?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...(organizationScopeId ? { organizationId: organizationScopeId } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    if (!user) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }

    const [grants, effectivePermissions] = await Promise.all([
      this.permissionService.getUserPermissionIds(userId),
      this.permissionService.resolveUserPermissions(userId, user.role as Role),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
      grants,
      effectivePermissions,
    };
  }

  async setUserPermissions(
    actorUserId: string,
    actorRole: Role,
    actorPermissions: readonly string[],
    targetUserId: string,
    permissionIds: string[],
    organizationScopeId?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        ...(organizationScopeId ? { organizationId: organizationScopeId } : {}),
      },
      select: { id: true, organizationId: true, role: true },
    });

    if (!user) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }

    if (user.role === PrismaRole.SUPER_ADMIN) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '超级管理员权限不可配置');
    }

    if (
      user.role === PrismaRole.PLATFORM_OPERATOR &&
      actorRole !== Role.SUPER_ADMIN
    ) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '不能修改平台账号权限');
    }

    await this.permissionService.assertGrantablePermissions(
      actorRole,
      actorPermissions,
      permissionIds,
      user.role as Role,
    );

    const grants = await this.permissionService.setUserGrants(
      targetUserId,
      permissionIds,
      actorUserId,
    );

    return {
      userId: targetUserId,
      grants,
      effectivePermissions: await this.permissionService.resolveUserPermissions(
        targetUserId,
        user.role as Role,
      ),
    };
  }
}
