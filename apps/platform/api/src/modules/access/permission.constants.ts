/**
 * 平台权限目录与角色默认权限。
 *
 * 路由约定：每个可访问页面须有 menuKey + permissionId；manage 隐含 read。
 */

import { Role } from '@wm/shared-core';

export interface PermissionDefinition {
  id: string;
  name: string;
  module: string;
  description?: string;
  sortOrder: number;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { id: 'org:profile:read', name: '查看企业资料', module: 'org', description: '查看本企业信息', sortOrder: 10 },
  { id: 'org:profile:update', name: '编辑企业资料', module: 'org', description: '修改企业名称', sortOrder: 11 },
  { id: 'org:member:list', name: '成员列表', module: 'org', description: '查看企业成员', sortOrder: 20 },
  { id: 'org:member:create', name: '添加成员', module: 'org', description: '邀请或创建成员', sortOrder: 21 },
  { id: 'org:member:update', name: '编辑成员', module: 'org', description: '修改成员信息', sortOrder: 22 },
  { id: 'org:member:grant', name: '授权成员', module: 'org', description: '为成员分配权限', sortOrder: 23 },
  { id: 'org:audit:read', name: '查看操作审计', module: 'org', description: '查看本企业操作日志', sortOrder: 24 },
  { id: 'org:integration:manage', name: '管理集成', module: 'org', description: '配置 Webhook 等集成', sortOrder: 25 },
  { id: 'org:billing:read', name: '查看订阅与配额', module: 'org', description: '查看套餐、账期、用量明细', sortOrder: 30 },
  {
    id: 'org:billing:manage',
    name: '管理订阅与配额',
    module: 'org',
    description: '仅平台 Console 运营（租户侧不可授）',
    sortOrder: 31,
  },
  { id: 'console:tenant:list', name: '租户列表', module: 'console', description: '查看全平台租户', sortOrder: 40 },
  { id: 'console:tenant:read', name: '租户详情', module: 'console', description: '查看租户详情', sortOrder: 41 },
  { id: 'console:tenant:create', name: '新建租户', module: 'console', description: '开户并创建首位登录账号', sortOrder: 42 },
  { id: 'console:tenant:update', name: '编辑租户', module: 'console', description: '修改套餐与账期', sortOrder: 43 },
  { id: 'console:menu:manage', name: '访问控制', module: 'console', description: '配置平台运营账号菜单与 Console 权限', sortOrder: 44 },
  { id: 'console:health:read', name: '系统健康', module: 'console', description: '查看队列与 Provider 状态', sortOrder: 45 },
  { id: 'console:gsc:manage', name: 'GSC 集成管理', module: 'console', description: '平台统一授权与站点搜索表现绑定', sortOrder: 46 },
  { id: 'console:prompt:read', name: '查看 Prompt', module: 'console', description: '查看 Prompt 模板', sortOrder: 50 },
  { id: 'console:prompt:manage', name: '管理 Prompt', module: 'console', description: '编辑 Prompt 与绑定', sortOrder: 51 },
  { id: 'console:audit:read', name: '操作审计', module: 'console', description: '查看平台操作日志', sortOrder: 52 },
  { id: 'project:create', name: '创建项目', module: 'project', description: '创建企业项目', sortOrder: 60 },
  { id: 'project:read', name: '查看项目', module: 'project', description: '查看项目列表与详情', sortOrder: 61 },
  { id: 'project:update', name: '编辑项目', module: 'project', description: '更新、归档或删除项目', sortOrder: 62 },
  { id: 'seo:job:create', name: '创建任务', module: 'seo', description: '创建文章任务', sortOrder: 70 },
  { id: 'seo:job:read', name: '查看任务', module: 'seo', description: '查看文章任务', sortOrder: 71 },
  { id: 'seo:job:review', name: '审核任务', module: 'seo', description: '确认大纲与敏感审核', sortOrder: 72 },
  { id: 'seo:keyword:manage', name: '管理词库', module: 'seo', description: '关键词与聚类管理', sortOrder: 73 },
  { id: 'seo:site:manage', name: '管理站点', module: 'seo', description: '站点配置与页面库', sortOrder: 74 },
];

/** 角色默认权限（SUPER_ADMIN 走 *:*:*） */
export const ROLE_DEFAULT_PERMISSIONS: Partial<Record<Role, string[]>> = {
  [Role.ADMIN]: [
    'org:profile:read',
    'org:profile:update',
    'org:member:list',
    'org:member:create',
    'org:member:update',
    'org:member:grant',
    'org:audit:read',
    'org:integration:manage',
    'org:billing:read',
    'project:create',
    'project:read',
    'project:update',
  ],
  [Role.MEMBER]: [
    'org:profile:read',
    'project:read',
  ],
  [Role.PLATFORM_OPERATOR]: [
    'console:tenant:list',
    'console:tenant:read',
    'console:tenant:create',
    'console:tenant:update',
    'console:health:read',
    'console:gsc:manage',
    'console:audit:read',
  ],
};

/** 授权时自动附带的前置权限（如「管理」含「查看」） */
export const PERMISSION_IMPLIES: Partial<Record<string, string[]>> = {
  'org:billing:manage': ['org:billing:read'],
  'org:member:grant': ['org:member:list'],
  'org:member:create': ['org:member:list'],
  'org:member:update': ['org:member:list'],
  'org:profile:update': ['org:profile:read'],
  'console:tenant:create': ['console:tenant:list'],
  'console:tenant:update': ['console:tenant:list', 'console:tenant:read'],
  'console:prompt:manage': ['console:prompt:read'],
};

/** 超管可授予平台运营账号的权限（全部 console 能力） */
export const PLATFORM_GRANTABLE_PERMISSION_IDS = PERMISSION_CATALOG.filter((item) =>
  item.id.startsWith('console:'),
).map((item) => item.id);

/** 租户管理员可授予成员的权限（仅 org:* + project:*，不含 seo / console / 续期） */
export const TENANT_GRANTABLE_PERMISSION_IDS = PERMISSION_CATALOG.filter(
  (item) =>
    (item.id.startsWith('org:') || item.id.startsWith('project:')) &&
    item.id !== 'org:billing:manage',
).map((item) => item.id);

/** 租户侧权限目录（成员授权页 / auth/me） */
export function listTenantPermissionCatalog(): PermissionDefinition[] {
  const allowed = new Set(TENANT_GRANTABLE_PERMISSION_IDS);
  return PERMISSION_CATALOG.filter((item) => allowed.has(item.id)).map((item) => ({
    ...item,
  }));
}

/** auth/me 与 /org/permissions 共用的租户 accessMeta */
export function buildTenantAccessMeta() {
  return {
    permissionCatalog: listTenantPermissionCatalog(),
    roleDefaultPermissions: Object.fromEntries(
      Object.entries(ROLE_DEFAULT_PERMISSIONS).map(([key, value]) => [key, value ?? []]),
    ),
    permissionImplies: PERMISSION_IMPLIES as Record<string, string[]>,
  };
}

/** 租户用户 DB 额外授权：仅保留 org:* / project:* */
export function sanitizeTenantUserGrants(permissionIds: readonly string[]): string[] {
  const allowed = new Set(TENANT_GRANTABLE_PERMISSION_IDS);
  return [...new Set(permissionIds.filter((id) => allowed.has(id)))];
}

/** 展开授权项：自动附带 PERMISSION_IMPLIES 前置权限 */
export function expandPermissionGrants(permissionIds: string[]): string[] {
  const expanded = new Set(permissionIds);
  for (const id of permissionIds) {
    for (const implied of PERMISSION_IMPLIES[id] ?? []) {
      expanded.add(implied);
    }
  }
  return [...expanded];
}
