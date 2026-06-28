/**
 * Prisma Client Extension：按请求上下文自动注入 organizationId 租户隔离。
 */

import { Prisma } from '@prisma/client';
import { getRequestContext } from '../context/request-context.store';

const TENANT_MODELS = new Set([
  'Project',
  'Site',
  'ArticleJob',
  'KeywordEntry',
  'KeywordCluster',
  'CreditUsage',
  'UserNotification',
  'OrgWebhook',
  'BillingChangeRequest',
  'ProjectAccessRequest',
]);

const READ_OPS = new Set(['findMany', 'findFirst', 'count', 'aggregate']);
const WRITE_FILTER_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany']);

export const tenantIsolationExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) {
          return query(args);
        }

        const ctx = getRequestContext();
        if (!ctx?.organizationId || ctx.bypassTenantScope) {
          return query(args);
        }

        const orgId = ctx.organizationId;
        if (READ_OPS.has(operation) || WRITE_FILTER_OPS.has(operation)) {
          const nextArgs = args as { where?: Record<string, unknown> };
          nextArgs.where = { ...(nextArgs.where ?? {}), organizationId: orgId };
        }

        return query(args);
      },
    },
  },
});
