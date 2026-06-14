/**
 * RBAC 角色要求装饰器：配合 AuthGuard 校验用户角色。
 */

import { SetMetadata } from '@nestjs/common';
import type { Role } from '@wm/shared-core';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
