/**
 * E2E：企业 Webhook 与计费读接口 smoke。
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import {
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_SKIP,
  E2E_REQUIRED,
} from './helpers/config.mjs';
import { apiRequest, isApiReachable, login } from './helpers/http.mjs';

/** @type {{ accessToken: string } | null} */
let orgCtx = null;
/** @type {string | null} */
let createdWebhookId = null;

function requireCtx(t, ctx) {
  if (!ctx) {
    t.skip('API 未就绪或 E2E_SKIP=true');
    return null;
  }
  return ctx;
}

describe('E2E org integrations', () => {
  before(async () => {
    if (E2E_SKIP) return;

    const reachable = await isApiReachable();
    if (!reachable) {
      if (E2E_REQUIRED) {
        throw new Error('E2E 需要 API 运行于 E2E_API_BASE_URL，但健康检查失败');
      }
      return;
    }

    const session = await login(E2E_DEV_EMAIL, E2E_DEV_PASSWORD);
    orgCtx = { accessToken: session.accessToken };
  });

  after(async () => {
    if (!orgCtx?.accessToken || !createdWebhookId) return;
    try {
      await apiRequest('DELETE', `/api/v1/org/webhooks/${createdWebhookId}`, {
        token: orgCtx.accessToken,
      });
    } catch {
      /* 清理失败不阻塞测试报告 */
    }
  });

  it('org admin can read billing quota and requests', async (t) => {
    const session = requireCtx(t, orgCtx);
    if (!session) return;

    const quota = await apiRequest('GET', '/api/v1/org/billing/quota', {
      token: session.accessToken,
    });
    assert.ok(quota.data?.planName, '应返回配额摘要');

    const requests = await apiRequest('GET', '/api/v1/org/billing/requests?page=1&limit=10', {
      token: session.accessToken,
    });
    assert.ok(Array.isArray(requests.data), '应返回计费申请列表');
    assert.ok(requests.meta?.pagination, '应包含分页 meta');
  });

  it('org admin can list and create webhooks', async (t) => {
    const session = requireCtx(t, orgCtx);
    if (!session) return;

    const list = await apiRequest('GET', '/api/v1/org/webhooks?page=1&limit=20', {
      token: session.accessToken,
    });
    assert.ok(Array.isArray(list.data), '应返回 Webhook 列表');
    assert.ok(list.meta?.pagination, '应包含分页 meta');

    const created = await apiRequest('POST', '/api/v1/org/webhooks', {
      token: session.accessToken,
      body: {
        url: `https://example.com/hooks/wm-e2e-${Date.now()}`,
        events: ['article.completed'],
      },
    });

    assert.ok(created.data?.id, '应创建 Webhook');
    createdWebhookId = created.data.id;
  });
});
