/**
 * Prisma Client Extension：按请求上下文自动注入 organizationId 租户隔离。
 *
 * ## 自动隔离（TENANT_MODELS）
 * 下列模型在 find/count/update/delete 时会自动追加 `where.organizationId`。
 *
 * ## 手动 scoping（未纳入扩展）
 * 以下模型**不能**依赖扩展自动注入，Service 查询必须显式带 orgId / projectId / siteId：
 *
 * | 模型 | 原因 |
 * |------|------|
 * | `SiteGscConnection` | 以 `siteId` 为业务主键（@unique），跨租户关联通过 Site 级联；Console 代运营需按 site 批量操作 |
 * | `SitePage` | 页面库按 site 维度索引，内链匹配走 siteId；扩展若只注入 orgId 无法覆盖 Console 无 org 上下文的任务 |
 * | `PlatformGscCredential` | 平台级单例（id=`default`），无 organizationId 字段，仅 super_admin / platform_operator 可访问 |
 * | `WebhookDeliveryLog` | 日志表带 orgId 但查询常经 webhookId 反查，需在 Service 双重校验 hook 归属 |
 * | `PromptTemplate` / 平台配置表 | 平台 Console 资源，无租户字段 |
 *
 * 新增模型时：若有 `organizationId` 且所有读写均在租户 JWT 上下文内，加入 TENANT_MODELS；否则在对应 Service 写 IDOR 校验并在此文档补充一行。
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
const CREATE_OPS = new Set(['create', 'createMany']);

function assertOrganizationIdOnCreate(
  data: Record<string, unknown> | Record<string, unknown>[],
  orgId: string,
): void {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    const rowOrgId = row.organizationId;
    if (typeof rowOrgId !== 'string' || !rowOrgId.trim()) {
      throw new Error(`租户隔离：create 必须显式设置 organizationId`);
    }
    if (rowOrgId !== orgId) {
      throw new Error(`租户隔离：create organizationId 与当前请求上下文不一致`);
    }
  }
}

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

        if (CREATE_OPS.has(operation)) {
          const nextArgs = args as { data?: Record<string, unknown> | Record<string, unknown>[] };
          if (nextArgs.data) {
            assertOrganizationIdOnCreate(nextArgs.data, orgId);
          }
        }

        return query(args);
      },
    },
  },
});
