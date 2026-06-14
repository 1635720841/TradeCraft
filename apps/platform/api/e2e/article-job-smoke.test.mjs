/**
 * E2E 冒烟：登录 → 建站点 → 创建任务 → 队列状态变更。
 *
 * 前置：API + Postgres + Redis 已启动，且已执行 db:seed。
 * 本地跳过：E2E_SKIP=true
 * CI 强制：E2E_REQUIRED=true（API 不可达则失败）
 *
 * 用法：cd apps/platform/api && pnpm test:e2e
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_PROJECT_ID,
  E2E_REQUIRED,
  E2E_SKIP,
  E2E_STATUS_POLL_INTERVAL_MS,
  E2E_STATUS_POLL_TIMEOUT_MS,
} from './helpers/config.mjs';
import { apiRequest, isApiReachable, login, pollUntil } from './helpers/http.mjs';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);

/** @type {{ accessToken: string } | null} */
let ctx = null;
let createdSiteId = '';
let createdJobId = '';

function requireCtx(t) {
  if (!ctx) {
    t.skip('API 未就绪或 E2E_SKIP=true');
  }
  return ctx;
}

describe('E2E article job smoke', () => {
  before(async () => {
    if (E2E_SKIP) {
      return;
    }

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

  it('login and load seed project', async (t) => {
    const { accessToken } = requireCtx(t);

    const me = await apiRequest('GET', '/api/v1/auth/me', { token: accessToken });
    assert.ok(me.data?.email, '应返回当前用户邮箱');

    const project = await apiRequest('GET', `/api/v1/platform/projects/${E2E_PROJECT_ID}`, {
      token: accessToken,
    });
    assert.equal(project.data?.projectType, 'seo-factory');
  });

  it('creates a site for the project', async (t) => {
    const { accessToken } = requireCtx(t);

    const suffix = Date.now();
    const created = await apiRequest('POST', `/api/v1/projects/${E2E_PROJECT_ID}/sites`, {
      token: accessToken,
      body: {
        domain: `e2e-${suffix}.example.com`,
        targetMarket: 'US',
        contentLanguage: 'en',
        brandVoice: 'E2E smoke test site',
      },
    });

    assert.ok(created.data?.id, '应返回站点 ID');
    createdSiteId = created.data.id;
  });

  it('creates article job and returns 202 QUEUED', async (t) => {
    const { accessToken } = requireCtx(t);
    assert.ok(createdSiteId, '依赖上一用例创建的站点');

    const keyword = `e2e smoke keyword ${Date.now()}`;
    const created = await apiRequest('POST', `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs`, {
      token: accessToken,
      body: {
        siteId: createdSiteId,
        targetKeyword: keyword,
        contentLanguage: 'en',
      },
    });

    assert.equal(created.status, 202);
    assert.equal(created.data?.status, 'QUEUED');
    assert.ok(created.data?.id);
    assert.ok(created.data?.traceId);
    createdJobId = created.data.id;
  });

  it('observes job status change after enqueue', async (t) => {
    const { accessToken } = requireCtx(t);
    assert.ok(createdJobId, '依赖上一用例创建的任务');

    const finalJob = await pollUntil(
      async () => {
        const detail = await apiRequest(
          'GET',
          `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${createdJobId}`,
          { token: accessToken },
        );
        return detail.data;
      },
      (job) => Boolean(job?.status && job.status !== 'QUEUED'),
      {
        intervalMs: E2E_STATUS_POLL_INTERVAL_MS,
        timeoutMs: E2E_STATUS_POLL_TIMEOUT_MS,
        label: '任务状态离开 QUEUED',
      },
    );

    assert.notEqual(finalJob.status, 'QUEUED');
    assert.ok(
      finalJob.status === 'RESEARCHING' ||
        finalJob.status === 'DRAFTING' ||
        finalJob.status === 'FAILED' ||
        TERMINAL_STATUSES.has(finalJob.status),
      `意外状态：${finalJob.status}`,
    );
  });

  it('downloads export html when a completed job exists', async (t) => {
    const { accessToken } = requireCtx(t);

    const list = await apiRequest('GET', `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs?limit=20`, {
      token: accessToken,
    });
    const completed = (list.data ?? []).find((job) => job.status === 'COMPLETED' && job.outputUrl);

    if (!completed) {
      t.skip('无已完成且可导出的任务，跳过下载断言');
      return;
    }

    const response = await fetch(
      `${process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000'}/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${completed.id}/export/html`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html/i);
  });
});
