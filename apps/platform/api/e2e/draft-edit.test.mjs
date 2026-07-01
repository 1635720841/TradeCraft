/**
 * E2E：稿件手动编辑 — PATCH → stale → history → rollback。
 *
 * 前置：API + Postgres + Redis + seed；库中至少有一条含初稿正文的任务。
 * 本地跳过：E2E_SKIP=true
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
} from './helpers/config.mjs';
import { apiRequest, apiMultipartRequest, E2eHttpError, isApiReachable, login } from './helpers/http.mjs';

/** 1×1 PNG，用于 E2E 图片上传 */
const E2E_PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** @type {{ accessToken: string } | null} */
let ctx = null;
/** @type {string | null} */
let targetJobId = null;
/** @type {{ title?: string; contentVersion: number; outputUrl?: string | null } | null} */
let originalSnapshot = null;

function requireCtx(t) {
  if (!ctx) {
    t.skip('API 未就绪或 E2E_SKIP=true');
    return null;
  }
  return ctx;
}

async function loadJob(accessToken, jobId) {
  const res = await apiRequest(
    'GET',
    `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${jobId}`,
    { token: accessToken },
  );
  return res.data;
}

describe('E2E draft manual edit', () => {
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

    const list = await apiRequest(
      'GET',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs?limit=50`,
      { token: session.accessToken },
    );

    const candidate = (list.data ?? []).find(
      (job) =>
        typeof job?.draftData?.content === 'string' &&
        job.draftData.content.trim().length > 0 &&
        ['COMPLETED', 'FAILED', 'REVIEWING', 'OPTIMIZING', 'DRAFTING', 'LINKING', 'ILLUSTRATING'].includes(
          job.status,
        ),
    );

    if (candidate?.id) {
      targetJobId = candidate.id;
      originalSnapshot = {
        title: candidate.draftData?.title,
        contentVersion: candidate.draftData?.contentVersion ?? 0,
        outputUrl: candidate.outputUrl ?? null,
      };
    }
  });

  it('patches draft title and marks export stale', async (t) => {
    const session = requireCtx(t);
    if (!session) return;
    const { accessToken } = session;
    if (!targetJobId || !originalSnapshot) {
      t.skip('无含初稿正文的任务，跳过编辑测试');
      return;
    }

    const jobBefore = await loadJob(accessToken, targetJobId);
    const version = jobBefore.draftData?.contentVersion ?? 0;
    const hadOutput = Boolean(jobBefore.outputUrl);
    const newTitle = `${jobBefore.draftData?.title ?? 'E2E Draft'} [edit ${Date.now()}]`;

    const patched = await apiRequest(
      'PATCH',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${targetJobId}/draft`,
      {
        token: accessToken,
        body: {
          title: newTitle,
          metaDescription: jobBefore.draftData?.metaDescription,
          content: jobBefore.draftData?.content,
          contentVersion: version,
          postSaveAction: 'none',
        },
      },
    );

    assert.equal(patched.data?.contentVersion, version + 1);
    assert.equal(patched.data?.draftData?.title, newTitle);
    assert.ok(patched.data?.staleness?.affected?.localSeo, '标题变更应 stale 本地 SEO');
    assert.equal(patched.data?.staleness?.affected?.semrush, false, '仅标题变更不应 stale Semrush');

    if (hadOutput) {
      assert.equal(patched.data?.outputUrl, null, 'export stale 应清空 outputUrl');
      assert.equal(patched.data?.staleness?.affected?.export, true);
    }
  });

  it('lists manual edit history', async (t) => {
    const session = requireCtx(t);
    if (!session) return;
    const { accessToken } = session;
    if (!targetJobId) {
      t.skip('无目标任务');
      return;
    }

    const history = await apiRequest(
      'GET',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${targetJobId}/draft/history`,
      { token: accessToken },
    );

    assert.ok(Array.isArray(history.data?.items));
    assert.ok(history.data.items.length >= 1, '保存后应有编辑历史');
    assert.ok(history.data.contentVersion >= 1);
  });

  it('rejects stale contentVersion with 409', async (t) => {
    const session = requireCtx(t);
    if (!session) return;
    const { accessToken } = session;
    if (!targetJobId) {
      t.skip('无目标任务');
      return;
    }

    const job = await loadJob(accessToken, targetJobId);
    const staleVersion = (job.draftData?.contentVersion ?? 1) - 1;

    try {
      await apiRequest(
        'PATCH',
        `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${targetJobId}/draft`,
        {
          token: accessToken,
          body: {
            title: job.draftData?.title,
            content: job.draftData?.content,
            contentVersion: staleVersion,
            postSaveAction: 'none',
          },
        },
      );
      assert.fail('应返回 409 版本冲突');
    } catch (error) {
      assert.ok(error instanceof E2eHttpError);
      assert.equal(error.status, 409);
      assert.equal(error.body?.error?.code ?? error.body?.code, 'DRAFT_VERSION_CONFLICT');
    }
  });

  it('uploads media asset and returns signed url', async (t) => {
    const session = requireCtx(t);
    if (!session) return;
    const { accessToken } = session;

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([E2E_PNG_1X1], { type: 'image/png' }),
      'e2e-media-asset.png',
    );

    const uploaded = await apiMultipartRequest(
      'POST',
      `/api/v1/projects/${E2E_PROJECT_ID}/media`,
      { token: accessToken, formData },
    );

    assert.ok(uploaded.data?.url, '应返回图片 URL');
    assert.match(
      uploaded.data.url,
      /^\/api\/v1\/projects\/.+\/media\/[0-9a-f-]{36}\/file\?exp=\d+&sig=[a-f0-9]+$/,
    );
    assert.equal(uploaded.data?.contentType, 'image/png');
    assert.ok(uploaded.data?.id);
    assert.ok(uploaded.data?.sizeBytes > 0);
  });

  it('rollbacks to pre-edit snapshot', async (t) => {
    const session = requireCtx(t);
    if (!session) return;
    const { accessToken } = session;
    if (!targetJobId || !originalSnapshot) {
      t.skip('无目标任务');
      return;
    }

    const history = await apiRequest(
      'GET',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${targetJobId}/draft/history`,
      { token: accessToken },
    );
    const latestEntry = history.data?.items?.[0];
    assert.ok(latestEntry?.id, '应有可回滚的历史条目');

    const rolled = await apiRequest(
      'POST',
      `/api/v1/projects/${E2E_PROJECT_ID}/article-jobs/${targetJobId}/draft/rollback`,
      {
        token: accessToken,
        body: { historyId: latestEntry.id, postSaveAction: 'none' },
      },
    );

    assert.equal(rolled.data?.draftData?.title, latestEntry.snapshot.title);
    assert.equal(rolled.data?.draftData?.content, latestEntry.snapshot.content);
  });
});
