/**
 * 侧栏菜单目录（与前端 router meta.menuKey 对齐）。
 */

import { Role } from '@wm/shared-core';

export interface MenuDefinition {
  id: string;
  title: string;
  routePath: string;
  permissionId?: string;
  targetRoles: Role[];
  sortOrder: number;
}

const CONSOLE_OPS_ROLES = [Role.SUPER_ADMIN, Role.PLATFORM_OPERATOR];

export const MENU_CATALOG: MenuDefinition[] = [
  {
    id: 'org:profile',
    title: '企业资料',
    routePath: '/org/profile',
    permissionId: 'org:profile:read',
    targetRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.MEMBER],
    sortOrder: 10,
  },
  {
    id: 'org:members',
    title: '成员与权限',
    routePath: '/org/members',
    permissionId: 'org:member:list',
    targetRoles: [Role.ADMIN, Role.SUPER_ADMIN],
    sortOrder: 11,
  },
  {
    id: 'org:projects',
    title: '项目管理',
    routePath: '/org/projects',
    permissionId: 'project:read',
    targetRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.MEMBER],
    sortOrder: 12,
  },
  {
    id: 'org:billing',
    title: '订阅与配额',
    routePath: '/org/billing',
    permissionId: 'org:billing:read',
    targetRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.MEMBER],
    sortOrder: 13,
  },
  {
    id: 'console:overview',
    title: '运营概览',
    routePath: '/console/overview',
    permissionId: 'console:tenant:list',
    targetRoles: CONSOLE_OPS_ROLES,
    sortOrder: 20,
  },
  {
    id: 'console:tenants',
    title: '租户管理',
    routePath: '/console/tenants',
    permissionId: 'console:tenant:list',
    targetRoles: CONSOLE_OPS_ROLES,
    sortOrder: 21,
  },
  {
    id: 'console:audit',
    title: '操作审计',
    routePath: '/console/audit',
    permissionId: 'console:audit:read',
    targetRoles: CONSOLE_OPS_ROLES,
    sortOrder: 22,
  },
  {
    id: 'console:health',
    title: '系统健康',
    routePath: '/console/health',
    permissionId: 'console:health:read',
    targetRoles: CONSOLE_OPS_ROLES,
    sortOrder: 23,
  },
  {
    id: 'console:prompts',
    title: 'Prompt 运营',
    routePath: '/console/prompts',
    permissionId: 'console:prompt:read',
    targetRoles: CONSOLE_OPS_ROLES,
    sortOrder: 24,
  },
  {
    id: 'console:access',
    title: '访问控制',
    routePath: '/console/access',
    permissionId: 'console:menu:manage',
    targetRoles: [Role.SUPER_ADMIN],
    sortOrder: 25,
  },
];

export const DEFAULT_ADMIN_MENU_IDS = [
  'org:profile',
  'org:members',
  'org:projects',
  'org:billing',
];

export const DEFAULT_MEMBER_MENU_IDS = ['org:profile', 'org:projects'];

export const DEFAULT_PLATFORM_OPERATOR_MENU_IDS = [
  'console:overview',
  'console:tenants',
  'console:health',
  'console:audit',
];

export const DEFAULT_SUPER_ADMIN_MENU_IDS = MENU_CATALOG.map((item) => item.id);
