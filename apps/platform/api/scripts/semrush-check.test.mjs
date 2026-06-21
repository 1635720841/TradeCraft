/**
 * Semrush 僵死检测与孤儿恢复逻辑单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(
    apiRoot,
    'dist/project-types/seo-factory/constants/semrush-check.js',
  ),
).href;

const {
  SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS,
  isSemrushCheckStale,
  resolveOptimizingHeartbeatMs,
  shouldRecoverOrphanOptimizing,
} = await import(modPath);

describe('shouldRecoverOrphanOptimizing', () => {
  it('does not recover when manual pending is active', () => {
    const now = Date.now();
    assert.equal(
      shouldRecoverOrphanOptimizing({
        status: 'OPTIMIZING',
        updatedAt: new Date(now - SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS - 60_000),
        seoCheckData: {
          semrush: {
            pending: { startedAt: new Date(now - 60_000).toISOString(), previousStatus: 'COMPLETED' },
            lastManualCheckError: 'old error',
          },
          workflowProgress: { updatedAt: new Date(now - 60_000).toISOString() },
        },
        now,
      }),
      false,
    );
  });

  it('does not recover on lastManualCheckError alone when heartbeat is fresh', () => {
    const now = Date.now();
    assert.equal(
      shouldRecoverOrphanOptimizing({
        status: 'OPTIMIZING',
        updatedAt: new Date(now - 30_000),
        seoCheckData: {
          semrush: { lastManualCheckError: '上次取消' },
          workflowProgress: { updatedAt: new Date(now - 30_000).toISOString() },
        },
        now,
      }),
      false,
    );
  });

  it('recovers workflow OPTIMIZING without pending after heartbeat stale', () => {
    const now = Date.now();
    assert.equal(
      shouldRecoverOrphanOptimizing({
        status: 'OPTIMIZING',
        updatedAt: new Date(now - SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS - 60_000),
        seoCheckData: {
          workflowProgress: {
            updatedAt: new Date(now - SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS - 60_000).toISOString(),
          },
        },
        now,
      }),
      true,
    );
  });
});

describe('isSemrushCheckStale', () => {
  it('marks pending older than 15 minutes as stale', () => {
    const now = Date.now();
    assert.equal(isSemrushCheckStale(new Date(now - 16 * 60_000).toISOString(), now), true);
    assert.equal(isSemrushCheckStale(new Date(now - 10 * 60_000).toISOString(), now), false);
  });
});

describe('resolveOptimizingHeartbeatMs', () => {
  it('uses the latest of updatedAt, workflowProgress, and pending', () => {
    const now = Date.now();
    const updatedAt = new Date(now - 120_000);
    const heartbeat = resolveOptimizingHeartbeatMs(
      {
        workflowProgress: { updatedAt: new Date(now - 30_000).toISOString() },
        semrush: { pending: { startedAt: new Date(now - 60_000).toISOString(), previousStatus: 'COMPLETED' } },
      },
      updatedAt,
      now,
    );
    assert.equal(heartbeat, now - 30_000);
  });
});
