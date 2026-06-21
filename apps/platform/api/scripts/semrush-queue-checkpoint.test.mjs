/**
 * Semrush 队列 checkpoint 落库条件单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/semrush-queue-checkpoint.util.js'),
).href;

const { shouldPersistSemrushQueueCheckpoint } = await import(modPath);

describe('shouldPersistSemrushQueueCheckpoint', () => {
  it('persists while OPTIMIZING', () => {
    assert.equal(
      shouldPersistSemrushQueueCheckpoint({
        status: 'OPTIMIZING',
        seoCheckData: { semrush: { pending: { startedAt: new Date().toISOString() } } },
      }),
      true,
    );
  });

  it('skips when user cancelled', () => {
    assert.equal(
      shouldPersistSemrushQueueCheckpoint({
        status: 'OPTIMIZING',
        seoCheckData: { semrush: { cancelled: true } },
      }),
      false,
    );
  });

  it('allows late recovery after queue wait timeout error', () => {
    assert.equal(
      shouldPersistSemrushQueueCheckpoint({
        status: 'COMPLETED',
        seoCheckData: {
          semrush: {
            lastManualCheckError:
              'Job wait semrush-check timed out before finishing, no finish notification arrived after 360000ms',
          },
        },
      }),
      true,
    );
  });

  it('skips unrelated completed jobs', () => {
    assert.equal(
      shouldPersistSemrushQueueCheckpoint({
        status: 'COMPLETED',
        seoCheckData: { semrush: { overall: 9.2 } },
      }),
      false,
    );
  });
});
