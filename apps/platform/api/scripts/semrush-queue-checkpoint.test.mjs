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

const { persistSemrushQueueCheckpoint, shouldPersistSemrushQueueCheckpoint } = await import(
  modPath
);
const { hashSemrushContent } = await import(
  pathToFileURL(
    resolve(apiRoot, 'dist/project-types/seo-factory/providers/semrush/semrush-content-hash.util.js'),
  ).href
);

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

  it('allows late recovery when workflow failed with queue wait timeout', () => {
    assert.equal(
      shouldPersistSemrushQueueCheckpoint({
        status: 'FAILED',
        errorMessage:
          'Job wait semrush-check timed out before finishing, no finish notification arrived after 360000ms',
        seoCheckData: { semrush: { overall: 8.7 } },
      }),
      true,
    );
  });

  it('persists while an RPA check is still in flight', () => {
    assert.equal(
      shouldPersistSemrushQueueCheckpoint({
        status: 'FAILED',
        seoCheckData: {
          semrush: {
            rpaInFlight: {
              startedAt: new Date().toISOString(),
              rpaKind: 'recheck',
              round: 4,
            },
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

describe('persistSemrushQueueCheckpoint', () => {
  function createPrisma(job) {
    const updates = [];
    return {
      updates,
      articleJob: {
        findUnique: async () => job,
        update: async (args) => {
          updates.push(args);
          return args;
        },
      },
    };
  }

  function createSemrushResult(content, overall = 9.1) {
    return {
      overall,
      suggestions: [],
      semrushRecommendedKeywords: ['battery cabinet'],
      semrushCheckRecord: { contentHash: hashSemrushContent(content) },
    };
  }

  it('skips a stale late checkpoint when another RPA content hash is active', async () => {
    const checkedContent = 'Old content for Semrush scoring.';
    const activeContent = 'New content already submitted to another RPA run.';
    const prisma = createPrisma({
      id: 'job-1',
      status: 'FAILED',
      targetKeyword: 'battery',
      errorMessage:
        'Job wait semrush-check timed out before finishing, no finish notification arrived after 360000ms',
      seoCheckData: {
        semrush: {
          rpaInFlight: {
            startedAt: new Date().toISOString(),
            contentHash: hashSemrushContent(activeContent),
          },
        },
      },
    });

    const persisted = await persistSemrushQueueCheckpoint(
      prisma,
      'job-1',
      createSemrushResult(checkedContent),
      checkedContent,
    );

    assert.equal(persisted, false);
    assert.equal(prisma.updates.length, 0);
  });

  it('persists a matching in-flight checkpoint and clears the in-flight marker', async () => {
    const checkedContent = 'Matching content for Semrush scoring.';
    const prisma = createPrisma({
      id: 'job-2',
      status: 'OPTIMIZING',
      targetKeyword: 'battery',
      errorMessage: null,
      seoCheckData: {
        semrush: {
          rpaInFlight: {
            startedAt: new Date().toISOString(),
            contentHash: hashSemrushContent(checkedContent),
          },
        },
      },
    });

    const persisted = await persistSemrushQueueCheckpoint(
      prisma,
      'job-2',
      createSemrushResult(checkedContent),
      checkedContent,
    );

    assert.equal(persisted, true);
    assert.equal(prisma.updates.length, 1);
    assert.equal(
      prisma.updates[0].data.seoCheckData.semrush.rpaInFlight,
      undefined,
    );
  });
});
