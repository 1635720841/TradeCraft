export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PLATFORM_OPERATOR = 'PLATFORM_OPERATOR',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export type OrganizationType = 'CUSTOMER' | 'PLATFORM';

/** 每个 HTTP 请求的请求上下文（从 JWT/Guard 填充，禁止从 body 读取 tenant ID） */
export interface RequestContext {
  traceId: string;
  userId: string;
  organizationId: string;
  organizationType: OrganizationType;
  projectId?: string;
  role: Role;
  permissions: string[];
}

const WILDCARD_PERMISSION = '*:*:*';

/** 是否拥有任一所需权限（超管通配符 *:*:* 视为全部） */
export function hasAnyPermission(
  userPermissions: readonly string[],
  required: readonly string[],
): boolean {
  if (userPermissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return required.some((perm) => userPermissions.includes(perm));
}
