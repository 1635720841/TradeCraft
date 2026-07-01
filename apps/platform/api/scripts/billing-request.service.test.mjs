/**
 * BillingRequestService 单元测试：创建、分页、重复申请拦截。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { BillingRequestService } = require(
  resolve(apiRoot, 'dist/modules/billing/billing-request.service.js'),
);
const { ErrorCodes } = require(resolve(apiRoot, 'dist/core/exceptions/error-codes.js'));

const ORG_A = '00000000-0000-4000-8000-000000000101';

function createPrisma() {
  const requests = [];
  const auditLogs = [];
  const emitted = [];

  return {
    requests,
    auditLogs,
    emitted,
    billingChangeRequest: {
      findFirst: async ({ where }) =>
        requests.find((row) => {
          if (where.id && row.id !== where.id) return false;
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.status && row.status !== where.status) return false;
          return true;
        }) ?? null,
      findMany: async ({ where, skip, take, orderBy }) => {
        let rows = requests.filter((row) => row.organizationId === where.organizationId);
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt - a.createdAt);
        }
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length));
      },
      count: async ({ where }) =>
        requests.filter((row) => row.organizationId === where.organizationId).length,
      create: async ({ data }) => {
        const row = {
          id: `req_${requests.length + 1}`,
          status: 'PENDING',
          createdAt: new Date(),
          ...data,
        };
        requests.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const idx = requests.findIndex((row) => row.id === where.id);
        requests[idx] = { ...requests[idx], ...data };
        return requests[idx];
      },
    },
  };
}

function createService(prisma) {
  return new BillingRequestService(
    prisma,
    { renewCurrentPeriod: async () => {}, applyPlan: async () => {}, addQuotaTopUp: async () => {} },
    { emit: (event, payload) => prisma.emitted.push({ event, payload }) },
    { log: async (entry) => prisma.auditLogs.push(entry) },
  );
}

describe('BillingRequestService', () => {
  it('create persists request, emits event and audit', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    const ctx = {
      organizationId: ORG_A,
      userId: 'user-1',
      traceId: 'tr_billing_req',
    };

    const row = await service.create(ctx, { type: 'RENEW', message: '续费' });

    assert.equal(prisma.requests.length, 1);
    assert.equal(row.type, 'RENEW');
    assert.equal(prisma.emitted.length, 1);
    assert.equal(prisma.auditLogs.at(-1)?.action, 'org.billing.request.create');
  });

  it('create rejects when pending request already exists', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    const ctx = {
      organizationId: ORG_A,
      userId: 'user-1',
      traceId: 'tr_billing_req',
    };

    await service.create(ctx, { type: 'RENEW' });

    await assert.rejects(
      () => service.create(ctx, { type: 'TOPUP', topUpAmount: 10 }),
      (err) => {
        assert.equal(err.code, ErrorCodes.FORBIDDEN);
        return true;
      },
    );
  });

  it('listForOrg returns paginated items scoped to organization', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    const ctx = {
      organizationId: ORG_A,
      userId: 'user-1',
      traceId: 'tr_billing_req',
    };

    await service.create(ctx, { type: 'RENEW' });
    await service.create(
      { organizationId: '00000000-0000-4000-8000-000000000102', userId: 'u2', traceId: 'tr2' },
      { type: 'RENEW' },
    );

    const result = await service.listForOrg(ORG_A, { page: 1, limit: 10 });
    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].organizationId, ORG_A);
  });

  it('approve rejects UPGRADE without targetPlanId', async () => {
    const prisma = createPrisma();
    prisma.$transaction = async (fn) => fn(prisma);
    const service = createService(prisma);
    const row = {
      id: 'req_upgrade_empty',
      organizationId: ORG_A,
      type: 'UPGRADE',
      targetPlanId: null,
      topUpAmount: null,
      status: 'PENDING',
    };
    prisma.requests.push(row);

    await assert.rejects(
      () => service.approve(row.id, 'reviewer-1'),
      (err) => {
        assert.equal(err.code, ErrorCodes.VALIDATION_ERROR);
        return true;
      },
    );
    assert.equal(prisma.requests[0].status, 'PENDING');
  });

  it('approve rolls back when subscription plan mutation fails', async () => {
    const prisma = createPrisma();
    prisma.$transaction = async (fn) => fn(prisma);

    let renewCalled = false;
    const service = new BillingRequestService(
      prisma,
      {
        renewCurrentPeriod: async () => {
          renewCalled = true;
          throw new Error('renew failed');
        },
        applyPlan: async () => {},
        addQuotaTopUp: async () => {},
      },
      { emit: () => {} },
      { log: async () => {} },
    );

    const ctx = {
      organizationId: ORG_A,
      userId: 'user-1',
      traceId: 'tr_billing_req',
    };
    const row = await service.create(ctx, { type: 'RENEW' });

    await assert.rejects(() => service.approve(row.id, 'reviewer-1'), /renew failed/);
    assert.equal(renewCalled, true);
    assert.equal(prisma.requests[0].status, 'PENDING');
  });
});
