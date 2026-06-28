/**
 * 侧栏菜单可见性服务。
 */

import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import {
  DEFAULT_ADMIN_MENU_IDS,
  DEFAULT_MEMBER_MENU_IDS,
  DEFAULT_PLATFORM_OPERATOR_MENU_IDS,
  DEFAULT_SUPER_ADMIN_MENU_IDS,
  MENU_CATALOG,
  type MenuDefinition,
} from './menu.constants';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async syncCatalogToDb(): Promise<void> {
    for (const item of MENU_CATALOG) {
      await this.prisma.platformMenu.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          title: item.title,
          routePath: item.routePath,
          permissionId: item.permissionId,
          targetRoles: item.targetRoles,
          sortOrder: item.sortOrder,
        },
        update: {
          title: item.title,
          routePath: item.routePath,
          permissionId: item.permissionId,
          targetRoles: item.targetRoles,
          sortOrder: item.sortOrder,
        },
      });
    }

    for (const role of [Role.ADMIN, Role.MEMBER, Role.PLATFORM_OPERATOR]) {
      const defaults =
        role === Role.ADMIN
          ? DEFAULT_ADMIN_MENU_IDS
          : role === Role.MEMBER
            ? DEFAULT_MEMBER_MENU_IDS
            : DEFAULT_PLATFORM_OPERATOR_MENU_IDS;
      for (const menuId of defaults) {
        await this.prisma.roleMenuGrant.upsert({
          where: { role_menuId: { role, menuId } },
          create: { role, menuId, enabled: true },
          update: {},
        });
      }
    }
  }

  /**
   * 默认由角色 + 权限推导菜单；仅当 Console 访问控制页显式配置后才走用户菜单覆盖。
   */
  async resolveVisibleMenuKeys(
    userId: string,
    role: Role,
    permissions: readonly string[] = [],
  ): Promise<string[]> {
    if (role === Role.SUPER_ADMIN) {
      return DEFAULT_SUPER_ADMIN_MENU_IDS;
    }

    const hasWildcard = permissions.includes('*:*:*');
    const hasPermission = (permissionId?: string) =>
      !permissionId || hasWildcard || permissions.includes(permissionId);

    const userGrants = await this.prisma.userMenuGrant.findMany({
      where: { userId },
      select: { menuId: true, enabled: true },
    });

    if (userGrants.length > 0) {
      return userGrants.filter((g) => g.enabled).map((g) => g.menuId);
    }

    const roleDefaults =
      role === Role.ADMIN
        ? DEFAULT_ADMIN_MENU_IDS
        : role === Role.PLATFORM_OPERATOR
          ? DEFAULT_PLATFORM_OPERATOR_MENU_IDS
          : DEFAULT_MEMBER_MENU_IDS;

    const permissionUnlocked = MENU_CATALOG.filter(
      (item) => item.targetRoles.includes(role) && hasPermission(item.permissionId),
    ).map((item) => item.id);

    return [...new Set([...roleDefaults, ...permissionUnlocked])];
  }

  async getUserMenuConfig(userId: string, role: Role, permissions: readonly string[] = []) {
    const userGrants = await this.prisma.userMenuGrant.findMany({
      where: { userId },
      select: { menuId: true, enabled: true },
    });
    const customized = userGrants.length > 0;
    const enabledSet = new Set(
      customized
        ? userGrants.filter((g) => g.enabled).map((g) => g.menuId)
        : await this.resolveVisibleMenuKeys(userId, role, permissions),
    );

    const menus = MENU_CATALOG.filter((item) =>
      item.targetRoles.includes(role),
    ).map((item) => ({
      ...item,
      enabled: enabledSet.has(item.id),
    }));

    return { customized, menus };
  }

  async setUserMenus(
    userId: string,
    role: Role,
    menuIds: string[],
    grantedById: string,
  ) {
    const allowedIds = new Set(
      MENU_CATALOG.filter((item) => item.targetRoles.includes(role)).map(
        (item) => item.id,
      ),
    );
    const unique = [...new Set(menuIds.filter((id) => allowedIds.has(id)))];

    await this.prisma.$transaction([
      this.prisma.userMenuGrant.deleteMany({ where: { userId } }),
      ...MENU_CATALOG.filter((item) => item.targetRoles.includes(role)).map(
        (item) =>
          this.prisma.userMenuGrant.create({
            data: {
              userId,
              menuId: item.id,
              enabled: unique.includes(item.id),
              grantedById,
            },
          }),
      ),
    ]);

    return this.getUserMenuConfig(userId, role, []);
  }

  listCatalog(): MenuDefinition[] {
    return MENU_CATALOG.map((item) => ({ ...item }));
  }
}
