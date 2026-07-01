/**
 * 标记路由在 Prisma 租户扩展中跳过 organizationId 自动注入（如 Console 跨租户查询）。
 */

import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_SCOPE_KEY = 'bypassTenantScope';

export const BypassTenantScope = () => SetMetadata(BYPASS_TENANT_SCOPE_KEY, true);
