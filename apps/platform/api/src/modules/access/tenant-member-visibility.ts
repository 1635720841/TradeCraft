/**
 * 企业侧可见成员：非超管不展示/统计平台账号。
 */

import { Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';

export const PLATFORM_STAFF_PRISMA_ROLES = [
  PrismaRole.SUPER_ADMIN,
  PrismaRole.PLATFORM_OPERATOR,
] as const;

export function isPlatformStaffOrgRole(role: string) {
  return (
    role === PrismaRole.SUPER_ADMIN || role === PrismaRole.PLATFORM_OPERATOR
  );
}

/** 企业 User 表查询：过滤平台账号 */
export function tenantVisibleUserRoleFilter(viewerRole?: Role) {
  if (viewerRole === Role.SUPER_ADMIN) {
    return {};
  }
  return { role: { notIn: [...PLATFORM_STAFF_PRISMA_ROLES] } };
}

/** ProjectMember 关联 User：过滤平台账号 */
export function tenantVisibleProjectMemberUserFilter(viewerRole?: Role) {
  if (viewerRole === Role.SUPER_ADMIN) {
    return {};
  }
  return { user: { role: { notIn: [...PLATFORM_STAFF_PRISMA_ROLES] } } };
}
