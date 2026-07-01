/**
 * Prisma Client Extension：软删除模型默认过滤 deletedAt IS NULL。
 */

import { Prisma } from '@prisma/client';

const SOFT_DELETE_MODELS = new Set([
  'Project',
  'Site',
  'ArticleJob',
  'KeywordEntry',
  'KeywordCluster',
  'SitePage',
]);

const READ_OPS = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate']);

function applySoftDeleteFilter(where: Record<string, unknown> | undefined): Record<string, unknown> {
  if (where && Object.prototype.hasOwnProperty.call(where, 'deletedAt')) {
    return where ?? {};
  }
  return { ...(where ?? {}), deletedAt: null };
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model) || !READ_OPS.has(operation)) {
          return query(args);
        }

        const nextArgs = args as { where?: Record<string, unknown> };
        nextArgs.where = applySoftDeleteFilter(nextArgs.where);
        return query(nextArgs);
      },
    },
  },
});

/** 软删除时间戳（Service 层 update 使用） */
export function softDeleteTimestamp(): Date {
  return new Date();
}
