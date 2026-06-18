/**
 * Semrush 僵死恢复状态推断单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/semrush-orphan-restore.util.js'),
).href;

const { resolveOrphanOptimizingRestore } = await import(modPath);

const completeDraft = {
  content: '# Smart BMS Guide\n\nBody text here.',
  internalLinksApplied: true,
  imagesApplied: true,
};

describe('resolveOrphanOptimizingRestore', () => {
  it('restores manual semrush interrupt to previous COMPLETED without job error', () => {
    const plan = resolveOrphanOptimizingRestore({
      seoCheckData: {
        workflowProgress: { phase: 'semrush-check', updatedAt: new Date().toISOString() },
        semrush: { manualCheckPreviousStatus: 'COMPLETED', passed: false },
      },
      semrushScore: 8,
      draftData: completeDraft,
    });

    assert.equal(plan.status, 'COMPLETED');
    assert.equal(plan.jobErrorMessage, null);
    assert.equal(plan.manualSemrushInterrupted, true);
    assert.equal(plan.failedStep, undefined);
  });

  it('marks workflow optimizing orphan as FAILED at optimizing step', () => {
    const plan = resolveOrphanOptimizingRestore({
      seoCheckData: {
        workflowProgress: { phase: 'local', updatedAt: new Date().toISOString() },
        semrush: { passed: false },
      },
      semrushScore: null,
      draftData: completeDraft,
      briefData: { outline: { targetWordCount: 1200 } },
    });

    assert.equal(plan.status, 'FAILED');
    assert.equal(plan.failedStep, 'optimizing');
    assert.equal(plan.manualSemrushInterrupted, false);
  });

  it('does not mark workflow semrush orphan as COMPLETED when draft pipeline is done', () => {
    const plan = resolveOrphanOptimizingRestore({
      seoCheckData: {
        workflowProgress: { phase: 'semrush', updatedAt: new Date().toISOString() },
        semrush: { passed: false },
      },
      semrushScore: 8,
      draftData: completeDraft,
      briefData: { outline: { targetWordCount: 1200 } },
    });

    assert.equal(plan.status, 'FAILED');
    assert.equal(plan.failedStep, 'optimizing');
    assert.equal(plan.manualSemrushInterrupted, false);
  });
});
