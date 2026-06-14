/**
 * SEO 优化流水线纯函数单元测试（续跑、轮次上限、Semrush 本地分保护）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/seo-pipeline.util.js'),
).href;
const scorePath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/seo-score.js'),
).href;

const {
  canResumeSemrushOptimization,
  meetsSemrushLocalGuard,
  resolveLocalOptimizeRoundCap,
  resolveSemrushOptimizeRoundCap,
  resolveSemrushRollbackReason,
  shouldSkipLocalOptimization,
} = await import(utilPath);
const { LOCAL_SEO_PASS_THRESHOLD, SEMRUSH_PASS_THRESHOLD } = await import(scorePath);

describe('shouldSkipLocalOptimization', () => {
  it('skips when localSeoScore >= 95', () => {
    assert.equal(shouldSkipLocalOptimization(95, {}), true);
    assert.equal(shouldSkipLocalOptimization(96, {}), true);
  });

  it('skips when seoCheck.local.passed is true', () => {
    assert.equal(shouldSkipLocalOptimization(94, { local: { passed: true } }), true);
  });

  it('does not skip when below threshold', () => {
    assert.equal(shouldSkipLocalOptimization(94, {}), false);
    assert.equal(shouldSkipLocalOptimization(null, {}), false);
  });
});

describe('canResumeSemrushOptimization', () => {
  const historyWithBaseline = [
    { phase: 'semrush', round: 0, kind: 'baseline' },
    { phase: 'semrush', round: 1, kind: 'optimize' },
  ];

  it('resumes when Semrush failed with baseline', () => {
    assert.equal(
      canResumeSemrushOptimization(
        8.8,
        { semrush: { passed: false, overall: 8.8 } },
        historyWithBaseline,
      ),
      true,
    );
  });

  it('does not resume without semrush baseline', () => {
    assert.equal(
      canResumeSemrushOptimization(8.8, { semrush: { passed: false } }, []),
      false,
    );
  });

  it('does not resume when already passing', () => {
    assert.equal(
      canResumeSemrushOptimization(9.0, { semrush: { passed: true } }, historyWithBaseline),
      false,
    );
  });
});

describe('meetsSemrushLocalGuard', () => {
  it('accepts when Semrush passing regardless of local', () => {
    assert.equal(meetsSemrushLocalGuard(90, 95, false, true), true);
  });

  it('accepts when local >= 95', () => {
    assert.equal(meetsSemrushLocalGuard(95, 95, true, false), true);
  });

  it('allows 1pt local drop when Semrush improves from passing baseline', () => {
    assert.equal(meetsSemrushLocalGuard(94, 95, true, false), true);
  });

  it('rejects when local drops below 94 even if Semrush improves', () => {
    assert.equal(meetsSemrushLocalGuard(93, 95, true, false), false);
  });

  it('rejects when baseline local was not passing', () => {
    assert.equal(meetsSemrushLocalGuard(94, 94, true, false), false);
  });
});

describe('resolveSemrushRollbackReason', () => {
  it('returns both when neither improved nor local guard', () => {
    assert.equal(resolveSemrushRollbackReason(false, false), 'both');
  });

  it('returns local_below_threshold when only local fails', () => {
    assert.equal(resolveSemrushRollbackReason(true, false), 'local_below_threshold');
  });
});

describe('resolveLocalOptimizeRoundCap', () => {
  it('adds near-miss rounds when score is 94/95', () => {
    assert.ok(resolveLocalOptimizeRoundCap(94, 0, false) >= 8);
  });
});

describe('resolveSemrushOptimizeRoundCap', () => {
  it('adds near-miss rounds when score is 8.8/9.0', () => {
    assert.ok(resolveSemrushOptimizeRoundCap(8.8, 0, false) >= 6);
  });
});

describe('pipeline resume scenario', () => {
  it('local passed + semrush 8.8 with baseline → skip local, resume semrush', () => {
    const seoCheck = { local: { passed: true, score: 95 }, semrush: { passed: false } };
    const history = [{ phase: 'semrush', round: 0, kind: 'baseline' }];
    assert.equal(shouldSkipLocalOptimization(95, seoCheck), true);
    assert.equal(canResumeSemrushOptimization(8.8, seoCheck, history), true);
    assert.equal(
      meetsSemrushLocalGuard(94, 95, true, false),
      true,
      'Semrush improve with local 94 should pass guard',
    );
  });
});
