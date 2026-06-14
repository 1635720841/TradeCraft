/**
 * M11 计费事件幂等单元测试。
 * 用法：cd apps/platform/api && pnpm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { BillingService } = require(resolve(apiRoot, 'dist/modules/billing/billing.service.js'));

const PAYLOAD = {
  traceId: 'tr_billing_test',
  jobId: '00000000-0000-4000-8000-000000000401',
  organizationId: '00000000-0000-4000-8000-000000000101',
  projectId: '00000000-0000-4000-8000-000000000201',
};

function createBillingPrisma() {
  const records = [];
  let findFirstCalls = 0;

  return {
    records,
    creditUsage: {
      findFirst: async ({ where }) => {
        findFirstCalls += 1;
        return records.find(
          (row) => row.traceId === where.traceId && row.serviceType === where.serviceType,
        ) ?? null;
      },
      create: async ({ data }) => {
        records.push({ id: `usage_${records.length + 1}`, ...data });
        return records.at(-1);
      },
    },
    get findFirstCalls() {
      return findFirstCalls;
    },
  };
}

function createLogger() {
  const logs = [];
  return {
    logs,
    info: (message, meta) => logs.push({ level: 'info', message, meta }),
    warn: () => {},
    error: () => {},
  };
}

describe('BillingService.onArticleCompleted', () => {
  it('records usage on first article.completed event', async () => {
    const prisma = createBillingPrisma();
    const logger = createLogger();
    const service = new BillingService(prisma, logger);

    await service.onArticleCompleted(PAYLOAD);

    assert.equal(prisma.records.length, 1);
    assert.equal(prisma.records[0].traceId, PAYLOAD.traceId);
    assert.equal(prisma.records[0].tokensOrCount, 1);
    assert.equal(logger.logs.at(-1)?.message, 'Article usage recorded');
  });

  it('skips duplicate billing for the same traceId (idempotent)', async () => {
    const prisma = createBillingPrisma();
    const logger = createLogger();
    const service = new BillingService(prisma, logger);

    await service.onArticleCompleted(PAYLOAD);
    await service.onArticleCompleted(PAYLOAD);

    assert.equal(prisma.records.length, 1);
    assert.equal(logger.logs.at(-1)?.message, 'Billing skipped (idempotent)');
    assert.equal(logger.logs.at(-1)?.meta?.action, 'billing.skip_duplicate');
  });
});
