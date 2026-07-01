/**
 * E2E：项目成员准入 — 未加入项目用户不可调用 SEO API。
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  E2E_PROJECT_ID,
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_OUTSIDER_EMAIL,
  E2E_OUTSIDER_PASSWORD,
  E2E_REQUIRED,
  E2E_SKIP,
} from './helpers/config.mjs';
import { apiRequest, E2eHttpError, isApiReachable, login } from './helpers/http.mjs';

/** @type {{ accessToken: string } | null} */
let memberCtx = null;
/** @type {{ accessToken: string } | null} */
let outsiderCtx = null;

function requireCtx(t, ctx) {
  if (!ctx) {
    t.skip('API 未就绪或 E2E_SKIP=true');
    return null;
  }
  return ctx;
}

describe('E2E project access', () => {
  before(async () => {
    if (E2E_SKIP) return;

    const reachable = await isApiReachable();
    if (!reachable) {
      if (E2E_REQUIRED) {
        throw new Error('E2E 需要 API 运行于 E2E_API_BASE_URL，但健康检查失败');
      }
      return;
    }

    const member = await login(E2E_DEV_EMAIL, E2E_DEV_PASSWORD);
    memberCtx = { accessToken: member.accessToken };

    const outsider = await login(E2E_OUTSIDER_EMAIL, E2E_OUTSIDER_PASSWORD);
    outsiderCtx = { accessToken: outsider.accessToken };
  });

  it('project member can read SEO article jobs', async (t) => {
    const session = requireCtx(t, memberCtx);
    if (!session) return;

    const result = await apiRequest(
      'GET',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs?page=1&limit=5`,
      { token: session.accessToken },
    );
    assert.ok(Array.isArray(result.data), '成员应能读取任务列表');
  });

  it('non-member is forbidden on SEO article jobs API', async (t) => {
    const session = requireCtx(t, outsiderCtx);
    if (!session) return;

    await assert.rejects(
      () =>
        apiRequest(
          'GET',
          `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs?page=1&limit=5`,
          { token: session.accessToken },
        ),
      (err) => {
        assert.ok(err instanceof E2eHttpError);
        assert.equal(err.status, 403);
        return true;
      },
    );
  });

  it('non-member sees canEnter false on org project detail', async (t) => {
    const session = requireCtx(t, outsiderCtx);
    if (!session) return;

    const result = await apiRequest('GET', `/api/v1/org/projects/${E2E_PROJECT_ID}`, {
      token: session.accessToken,
    });
    assert.equal(result.data?.canEnter, false);
    assert.equal(result.data?.isMember, false);
  });
});
