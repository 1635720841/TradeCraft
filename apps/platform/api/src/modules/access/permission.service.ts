/**
 * 权限解析与授权服务。
 */

import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import {
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
  TENANT_GRANTABLE_PERMISSION_IDS,
  buildTenantAccessMeta,
  expandPermissionGrants,
  listTenantPermissionCatalog,
  sanitizeTenantUserGrants,
} from './permission.constants';

const WILDCARD = '*:*:*';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalog() {
    return PERMISSION_CATALOG.map((item) => ({ ...item }));
  }

  listTenantCatalog() {
    return listTenantPermissionCatalog();
  }

  buildTenantAccessMeta() {
    return buildTenantAccessMeta();
  }

  async syncCatalogToDb(): Promise<void> {
    for (const item of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          name: item.name,
          module: item.module,
          description: item.description,
          sortOrder: item.sortOrder,
        },
        update: {
          name: item.name,
          module: item.module,
          description: item.description,
          sortOrder: item.sortOrder,
        },
      });
    }
  }

  async getUserPermissionIds(userId: string): Promise<string[]> {
    const grants = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { permissionId: true },
    });
    return grants.map((g) => g.permissionId);
  }

  async resolveUserPermissions(userId: string, role: Role): Promise<string[]> {
    if (role === Role.SUPER_ADMIN) {
      return [WILDCARD];
    }

    const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
    let grants = await this.getUserPermissionIds(userId);
    if (role === Role.ADMIN || role === Role.MEMBER) {
      grants = sanitizeTenantUserGrants(grants);
    }
    return [...new Set([...defaults, ...grants])];
  }

  async assertGrantablePermissions(
    actorRole: Role,
    actorPermissions: readonly string[],
    permissionIds: string[],
    targetRole?: Role,
  ): Promise<void> {
    if (actorRole === Role.SUPER_ADMIN) {
      if (targetRole === Role.PLATFORM_OPERATOR) {
        for (const id of permissionIds) {
          if (!PERMISSION_CATALOG.some((item) => item.id === id)) {
            throw new BusinessException(ErrorCodes.FORBIDDEN, `未知权限：${id}`);
          }
        }
      }
      return;
    }

    const allowed = new Set(
      actorPermissions.filter((id) => TENANT_GRANTABLE_PERMISSION_IDS.includes(id)),
    );

    for (const id of permissionIds) {
      if (!TENANT_GRANTABLE_PERMISSION_IDS.includes(id)) {
        throw new BusinessException(ErrorCodes.FORBIDDEN, `不可授予权限：${id}`);
      }
      if (!allowed.has(id)) {
        throw new BusinessException(ErrorCodes.FORBIDDEN, '无权授予该权限');
      }
    }
  }

  async setUserGrants(
    userId: string,
    permissionIds: string[],
    grantedById: string,
  ): Promise<string[]> {
    const unique = expandPermissionGrants([...new Set(permissionIds)]);

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      ...unique.map((permissionId) =>
        this.prisma.userPermission.create({
          data: { userId, permissionId, grantedById },
        }),
      ),
    ]);

    return unique;
  }
}
