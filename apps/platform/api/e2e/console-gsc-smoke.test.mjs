/**
 * E2E：Console GSC 管理 smoke（无需 OAuth，仅测 status/sites 列表）。
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  E2E_SKIP,
  E2E_REQUIRED,
  E2E_SUPER_EMAIL,
  E2E_SUPER_PASSWORD,
} from './helpers/config.mjs';
import { apiRequest, E2eHttpError, isApiReachable, login } from './helpers/http.mjs';

/** @type {{ accessToken: string } | null} */
let consoleCtx = null;

function requireCtx(t, ctx) {
  if (!ctx) {
    t.skip('API 未就绪或 E2E_SKIP=true');
    return null;
  }
  return ctx;
}

describe('E2E console GSC smoke', () => {
  before(async () => {
    if (E2E_SKIP) return;

    const reachable = await isApiReachable();
    if (!reachable) {
      if (E2E_REQUIRED) {
        throw new Error('E2E 需要 API 运行于 E2E_API_BASE_URL，但健康检查失败');
      }
      return;
    }

    const session = await login(E2E_SUPER_EMAIL, E2E_SUPER_PASSWORD);
    consoleCtx = { accessToken: session.accessToken };
  });

  it('platform operator can read GSC status', async (t) => {
    const session = requireCtx(t, consoleCtx);
    if (!session) return;

    const result = await apiRequest('GET', '/api/v1/console/gsc/status', {
      token: session.accessToken,
    });

    assert.ok(result.data !== undefined, '应返回 GSC 平台状态');
    assert.ok(typeof result.data.connected === 'boolean');
  });

  it('platform operator can list GSC sites with pagination meta', async (t) => {
    const session = requireCtx(t, consoleCtx);
    if (!session) return;

    const result = await apiRequest(
      'GET',
      '/api/v1/console/gsc/sites?page=1&limit=5',
      { token: session.accessToken },
    );

    assert.ok(Array.isArray(result.data), '应返回站点列表');
    assert.ok(result.meta?.pagination, '应包含分页 meta');
    assert.equal(result.meta.pagination.page, 1);
  });

  it('org admin cannot access console GSC status', async (t) => {
    if (E2E_SKIP) {
      t.skip('E2E_SKIP=true');
      return;
    }

    const reachable = await isApiReachable();
    if (!reachable) {
      t.skip('API 未就绪');
      return;
    }

    const { accessToken } = await login(
      process.env.E2E_DEV_EMAIL ?? 'admin@dev.local',
      process.env.E2E_DEV_PASSWORD ?? 'admin123',
    );

    await assert.rejects(
      () => apiRequest('GET', '/api/v1/console/gsc/status', { token: accessToken }),
      (err) => {
        assert.ok(err instanceof E2eHttpError);
        assert.ok([403, 401].includes(err.status));
        return true;
      },
    );
  });
});
