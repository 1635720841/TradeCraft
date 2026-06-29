/**
 * 项目类型权限与成员角色默认权限。
 */

import { ProjectMemberRole } from '@prisma/client';

/** 各项目类型可授予的权限 ID */
export const PROJECT_TYPE_PERMISSION_IDS: Record<string, string[]> = {
  'seo-factory': [
    'project:read',
    'project:update',
    'seo:job:create',
    'seo:job:read',
    'seo:job:review',
    'seo:keyword:manage',
    'seo:site:manage',
  ],
};

/** 项目成员角色默认权限 */
export const PROJECT_MEMBER_ROLE_PERMISSIONS: Record<ProjectMemberRole, string[]> = {
  OWNER: [],
  EDITOR: [
    'project:read',
    'seo:job:create',
    'seo:job:read',
    'seo:keyword:manage',
    'seo:site:manage',
  ],
  VIEWER: ['project:read', 'seo:job:read'],
};

export function resolveProjectMemberRoleDefaults(
  role: ProjectMemberRole,
  projectType: string,
): string[] {
  if (role === ProjectMemberRole.OWNER) {
    return [...(PROJECT_TYPE_PERMISSION_IDS[projectType] ?? ['project:read'])];
  }
  const allowed = new Set(PROJECT_TYPE_PERMISSION_IDS[projectType] ?? []);
  return PROJECT_MEMBER_ROLE_PERMISSIONS[role].filter((id) => allowed.has(id));
}

export function listGrantablePermissionsForProjectType(projectType: string): string[] {
  return [...(PROJECT_TYPE_PERMISSION_IDS[projectType] ?? [])];
}

export function isWithinAccessWindow(
  accessStart: Date | null | undefined,
  accessEnd: Date | null | undefined,
  at = new Date(),
): boolean {
  if (accessStart && at < accessStart) {
    return false;
  }
  if (accessEnd && at > accessEnd) {
    return false;
  }
  return true;
}

/** 当前用户对项目的访问状态（列表展示用） */
export type ProjectMyAccessStatus =
  | 'usable'
  | 'not_open'
  | 'not_member'
  | 'member_expired'
  | 'archived';

export interface ProjectListAccessMeta {
  accessActive: boolean;
  isMember: boolean;
  memberAccessActive: boolean;
  myAccessStatus: ProjectMyAccessStatus;
  canEnter: boolean;
  canManage: boolean;
}

export function resolveProjectListAccessMeta(input: {
  status: string;
  accessStart: Date | null;
  accessEnd: Date | null;
  /** 仅用于管理权限（添加成员、改访问期），不用于进入项目 */
  isOrgAdmin: boolean;
  isSuperAdmin: boolean;
  member?: {
    role: ProjectMemberRole;
    accessStart: Date | null;
    accessEnd: Date | null;
  } | null;
}): ProjectListAccessMeta {
  const accessActive = isWithinAccessWindow(input.accessStart, input.accessEnd);
  const isMember = !!input.member;
  const memberAccessActive = !input.member
    ? false
    : isWithinAccessWindow(input.member.accessStart, input.member.accessEnd);

  let myAccessStatus: ProjectMyAccessStatus;
  if (input.status === 'ARCHIVED') {
    myAccessStatus = 'archived';
  } else if (!accessActive) {
    myAccessStatus = 'not_open';
  } else if (!input.member) {
    myAccessStatus = 'not_member';
  } else if (!memberAccessActive) {
    myAccessStatus = 'member_expired';
  } else {
    myAccessStatus = 'usable';
  }

  const canEnter =
    input.status === 'ACTIVE' &&
    (input.isSuperAdmin ||
      (accessActive && !!input.member && memberAccessActive));

  const canManage =
    input.isOrgAdmin || input.member?.role === ProjectMemberRole.OWNER;

  return {
    accessActive,
    isMember,
    memberAccessActive,
    myAccessStatus,
    canEnter,
    canManage,
  };
}
