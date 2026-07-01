/**
 * addQuotaTopUp 写入 ArticleQuotaTopUp 审计表。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const servicePath = pathToFileURL(
  resolve(apiRoot, 'dist/modules/billing/subscription-plan.service.js'),
).href;

const { SubscriptionPlanService } = await import(servicePath);

describe('SubscriptionPlanService.addQuotaTopUp', () => {
  it('increments bonus and writes ArticleQuotaTopUp in one transaction', async () => {
    const writes = [];
    const mockDb = {
      $transaction: async (fn) => fn(mockDb),
      organization: {
        update: async ({ data }) => {
          assert.equal(data.articleQuotaBonus.increment, 5);
          return { articleQuotaBonus: 15 };
        },
      },
      articleQuotaTopUp: {
        create: async ({ data }) => {
          writes.push(data);
          return { id: 'topup-1', ...data };
        },
      },
    };

    const service = new SubscriptionPlanService(mockDb);
    const result = await service.addQuotaTopUp('org-1', 5, '  manual top up ');

    assert.deepEqual(result, { amount: 5, bonusTotal: 15, note: '  manual top up ' });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      organizationId: 'org-1',
      amount: 5,
      note: 'manual top up',
    });
  });

  it('rejects amount below 1', async () => {
    const service = new SubscriptionPlanService({});
    await assert.rejects(() => service.addQuotaTopUp('org-1', 0), /加购数量至少为 1/);
  });
});
