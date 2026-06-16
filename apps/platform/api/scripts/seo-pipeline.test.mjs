/**
 * SEO 优化流水线纯函数单元测试（续跑、轮次上限、Semrush 验收判定）。
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
  resolveLocalOptimizeRoundCap,
  resolveSemrushOptimizeRoundCap,
  shouldAcceptSemrushCandidate,
  shouldSkipLocalOptimization,
  shouldSkipLocalPipeline,
} = await import(utilPath);
const { SEMRUSH_PASS_THRESHOLD } = await import(scorePath);

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

describe('shouldSkipLocalPipeline', () => {
  it('skips when local already passed', () => {
    assert.equal(shouldSkipLocalPipeline(true, false), true);
  });

  it('skips when resuming Semrush even if local dropped', () => {
    assert.equal(shouldSkipLocalPipeline(false, true), true);
  });

  it('does not skip when neither passed nor semrush resumable', () => {
    assert.equal(shouldSkipLocalPipeline(false, false), false);
  });
});

describe('shouldAcceptSemrushCandidate', () => {
  it('accepts when Semrush passing regardless of local', () => {
    assert.equal(shouldAcceptSemrushCandidate(false, true), true);
  });

  it('accepts when Semrush improves even if local would drop', () => {
    assert.equal(shouldAcceptSemrushCandidate(true, false), true);
  });

  it('rejects when Semrush neither improves nor passes', () => {
    assert.equal(shouldAcceptSemrushCandidate(false, false), false);
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
  it('local passed + semrush 8.9 with baseline → skip local, resume semrush', () => {
    const seoCheck = { local: { passed: false, score: 89 }, semrush: { passed: false } };
    const history = [{ phase: 'semrush', round: 0, kind: 'baseline' }];
    assert.equal(shouldSkipLocalOptimization(89, seoCheck), false);
    assert.equal(canResumeSemrushOptimization(8.9, seoCheck, history), true);
    assert.equal(
      shouldSkipLocalPipeline(false, true),
      true,
      'Semrush resume should skip local gate even when local is 89',
    );
  });

  it('Semrush passing threshold is 9.0', () => {
    assert.equal(SEMRUSH_PASS_THRESHOLD, 9.0);
  });
});
