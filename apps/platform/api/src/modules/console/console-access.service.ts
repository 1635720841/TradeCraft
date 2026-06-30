/**
 * Console 访问控制：平台用户权限与菜单配置。
 */

import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { MenuService } from '../access/menu.service';

@Injectable()
export class ConsoleAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly menuService: MenuService,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(page: number, limit: number, keyword?: string, scope?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    const trimmed = keyword?.trim();

    const platformRoles = [PrismaRole.SUPER_ADMIN, PrismaRole.PLATFORM_OPERATOR];
    const tenantRoles = [PrismaRole.ADMIN, PrismaRole.MEMBER];
    const roleFilter =
      scope === 'platform'
        ? { role: { in: platformRoles } }
        : scope === 'tenant'
          ? { role: { in: tenantRoles } }
          : {};

    const where = {
      ...roleFilter,
      ...(trimmed
        ? {
            OR: [
              { email: { contains: trimmed, mode: 'insensitive' as const } },
              { name: { contains: trimmed, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          organization: { select: { id: true, name: true, type: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        organizationType: user.organization.type,
      })),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  getUserPermissions(userId: string) {
    return this.accessService.getUserPermissions(userId);
  }

  setUserPermissions(
    actorUserId: string,
    actorRole: Role,
    actorPermissions: readonly string[],
    targetUserId: string,
    permissionIds: string[],
    traceId?: string,
  ) {
    return this.accessService
      .setUserPermissions(
        actorUserId,
        actorRole,
        actorPermissions,
        targetUserId,
        permissionIds,
      )
      .then(async (result) => {
        await this.auditService.log({
          actorUserId,
          action: 'console.permission.grant',
          targetType: 'User',
          targetId: targetUserId,
          metadata: { permissionIds },
          traceId,
        });
        return result;
      });
  }

  async getUserMenus(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });
    if (!user) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }
    if (user.role === PrismaRole.SUPER_ADMIN || user.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '平台账号菜单不可配置');
    }

    const config = await this.menuService.getUserMenuConfig(userId, user.role as Role);
    return { user, customized: config.customized, menus: config.menus };
  }

  async setUserMenus(
    actorUserId: string,
    traceId: string,
    targetUserId: string,
    menuIds: string[],
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }
    if (user.role === PrismaRole.SUPER_ADMIN || user.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '平台账号菜单不可配置');
    }

    const config = await this.menuService.setUserMenus(
      targetUserId,
      user.role as Role,
      menuIds,
      actorUserId,
    );

    await this.auditService.log({
      actorUserId,
      action: 'console.menu.update',
      targetType: 'User',
      targetId: targetUserId,
      metadata: { menuIds },
      traceId,
    });

    const fullUser = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });

    return {
      user: fullUser!,
      customized: true,
      menus: config.menus,
    };
  }
}
