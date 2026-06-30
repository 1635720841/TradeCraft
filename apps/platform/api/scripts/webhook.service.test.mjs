/**
 * WebhookService 单元测试：分页、租户隔离、审计。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { WebhookService } = require(resolve(apiRoot, 'dist/modules/webhook/webhook.service.js'));
const { ErrorCodes } = require(resolve(apiRoot, 'dist/core/exceptions/error-codes.js'));

const ORG_A = '00000000-0000-4000-8000-000000000101';
const ORG_B = '00000000-0000-4000-8000-000000000102';
const HOOK_ID = '00000000-0000-4000-8000-000000000301';

function createPrisma() {
  const hooks = [
    {
      id: HOOK_ID,
      organizationId: ORG_A,
      url: 'https://example.com/hooks/a',
      events: ['article.completed'],
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const auditLogs = [];

  return {
    hooks,
    auditLogs,
    orgWebhook: {
      count: async ({ where }) =>
        hooks.filter((row) => row.organizationId === where.organizationId).length,
      findMany: async ({ where, skip, take }) =>
        hooks
          .filter((row) => row.organizationId === where.organizationId)
          .slice(skip ?? 0, (skip ?? 0) + (take ?? hooks.length)),
      findFirst: async ({ where }) =>
        hooks.find(
          (row) =>
            row.id === where.id &&
            (!where.organizationId || row.organizationId === where.organizationId),
        ) ?? null,
      create: async ({ data, select }) => {
        const row = {
          id: `hook_${hooks.length + 1}`,
          secret: data.secret,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        hooks.push(row);
        if (!select) return row;
        return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
      },
      update: async ({ where, data, select }) => {
        const idx = hooks.findIndex((row) => row.id === where.id);
        hooks[idx] = { ...hooks[idx], ...data, updatedAt: new Date() };
        const row = hooks[idx];
        if (!select) return row;
        return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
      },
      delete: async ({ where }) => {
        const idx = hooks.findIndex((row) => row.id === where.id);
        hooks.splice(idx, 1);
      },
    },
    webhookDeliveryLog: {
      findMany: async () => [],
      count: async () => 0,
    },
  };
}

function createAuditService(prisma) {
  return {
    log: async (entry) => {
      prisma.auditLogs.push(entry);
    },
  };
}

describe('WebhookService', () => {
  it('list returns paginated hooks scoped to organization', async () => {
    const prisma = createPrisma();
    const service = new WebhookService(prisma, createAuditService(prisma));

    const result = await service.list(ORG_A, { page: 1, limit: 10 });

    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, HOOK_ID);
  });

  it('create records audit log', async () => {
    const prisma = createPrisma();
    const service = new WebhookService(prisma, createAuditService(prisma));

    const row = await service.create(ORG_A, 'user-1', 'tr_hook', {
      url: 'https://example.com/hooks/new',
      events: ['article.failed'],
    });

    assert.ok(row.secret);
    assert.equal(prisma.auditLogs.length, 1);
    assert.equal(prisma.auditLogs[0].action, 'org.webhook.create');
  });

  it('update rejects cross-organization webhook with NOT_FOUND', async () => {
    const prisma = createPrisma();
    const service = new WebhookService(prisma, createAuditService(prisma));

    await assert.rejects(
      () =>
        service.update(ORG_B, 'user-1', 'tr_hook', HOOK_ID, {
          isActive: false,
        }),
      (err) => {
        assert.equal(err.code, ErrorCodes.NOT_FOUND);
        return true;
      },
    );
  });

  it('remove deletes hook and writes audit', async () => {
    const prisma = createPrisma();
    const service = new WebhookService(prisma, createAuditService(prisma));

    const result = await service.remove(ORG_A, 'user-1', 'tr_hook', HOOK_ID);

    assert.equal(result.deleted, true);
    assert.equal(prisma.hooks.length, 0);
    assert.equal(prisma.auditLogs.at(-1)?.action, 'org.webhook.delete');
  });
});
