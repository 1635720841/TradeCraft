/**
 * E2E：批量导出 zip + 响应头失败明细。
 *
 * 前置：存在至少一条 COMPLETED 且可导出的任务（通常来自 seed 或 smoke）。
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_PROJECT_ID,
  E2E_REQUIRED,
  E2E_SKIP,
} from './helpers/config.mjs';
import { apiBinaryRequest, apiRequest, isApiReachable, login } from './helpers/http.mjs';

/** @type {{ accessToken: string } | null} */
let ctx = null;

function requireCtx(t) {
  if (!ctx) {
    t.skip('API 未就绪或 E2E_SKIP=true');
    return null;
  }
  return ctx;
}

describe('E2E batch export', () => {
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
    ctx = { accessToken: session.accessToken };
  });

  it('rejects empty jobIds with validation error', async (t) => {
    const session = requireCtx(t);
    if (!session) return;

    try {
      await apiBinaryRequest(
        'POST',
        `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/batch/export`,
        {
          token: session.accessToken,
          body: { jobIds: [] },
        },
      );
      assert.fail('应返回校验错误');
    } catch (error) {
      assert.ok(error.status >= 400 && error.status < 500);
    }
  });

  it('returns zip and export headers for exportable jobs', async (t) => {
    const session = requireCtx(t);
    if (!session) return;

    const list = await apiRequest(
      'GET',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs?limit=50`,
      { token: session.accessToken },
    );

    const exportable = (list.data ?? []).filter(
      (job) => job.status === 'COMPLETED' && job.outputUrl && job.exportReady !== false,
    );

    if (exportable.length === 0) {
      t.skip('无已完成且可导出的任务');
      return;
    }

    const jobIds = exportable.slice(0, 2).map((job) => job.id);
    const result = await apiBinaryRequest(
      'POST',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/batch/export`,
      {
        token: session.accessToken,
        body: { jobIds },
      },
    );

    assert.equal(result.status, 200);
    assert.ok(result.buffer.length > 100, 'zip 应有内容');
    assert.match(result.headers.get('content-type') ?? '', /zip/i);
    assert.ok(result.headers.get('x-export-exported'), '应返回 X-Export-Exported');
    assert.ok(result.headers.get('x-export-failed') != null, '应返回 X-Export-Failed');
  });
});
