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
  isSemrushSurgicalTier,
  resolveLocalOptimizeRoundCap,
  resolveSemrushOptimizeRoundCap,
  shouldAcceptLocalCandidate,
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

describe('shouldAcceptLocalCandidate', () => {
  it('rejects when keywordCoverage drops even within near-miss margin', () => {
    assert.equal(
      shouldAcceptLocalCandidate({
        candidateScore: 93,
        bestScore: 94,
        candidateKeywordCoverage: 20,
        bestKeywordCoverage: 25,
        nearMiss: true,
        readabilityImproved: true,
      }),
      false,
    );
  });

  it('accepts near-miss readability improvement without keyword drop', () => {
    assert.equal(
      shouldAcceptLocalCandidate({
        candidateScore: 93,
        bestScore: 94,
        candidateKeywordCoverage: 25,
        bestKeywordCoverage: 25,
        nearMiss: true,
        readabilityImproved: true,
      }),
      true,
    );
  });
});

describe('shouldAcceptSemrushCandidate', () => {
  const base = {
    candidateMissingKeywordCount: 2,
    bestMissingKeywordCount: 2,
    readabilityImproved: false,
  };

  it('accepts when Semrush passing', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({ ...base, candidateOverall: 9.0, bestOverall: 8.8 }),
      true,
    );
  });

  it('accepts when Semrush improves', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({ ...base, candidateOverall: 8.8, bestOverall: 8.7 }),
      true,
    );
  });

  it('accepts within RPA tolerance (±0.05)', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({ ...base, candidateOverall: 8.75, bestOverall: 8.8 }),
      true,
    );
  });

  it('accepts when missing keywords reduced within score band', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({
        candidateOverall: 8.75,
        bestOverall: 8.8,
        candidateMissingKeywordCount: 1,
        bestMissingKeywordCount: 3,
        readabilityImproved: false,
      }),
      true,
    );
  });

  it('accepts readability improvement within 0.1 when score flat', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({
        candidateOverall: 8.75,
        bestOverall: 8.8,
        candidateMissingKeywordCount: 2,
        bestMissingKeywordCount: 2,
        readabilityImproved: true,
      }),
      true,
    );
  });

  it('rejects when score drops beyond tolerance without gains', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({ ...base, candidateOverall: 8.5, bestOverall: 8.8 }),
      false,
    );
  });

  it('accepts surgical-tier complex word improvement within band', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({
        candidateOverall: 8.75,
        bestOverall: 8.9,
        candidateMissingKeywordCount: 2,
        bestMissingKeywordCount: 2,
        readabilityImproved: false,
        candidateComplexWordHits: 1,
        bestComplexWordHits: 4,
      }),
      true,
    );
  });

  it('accepts surgical-tier hard sentence improvement within band', () => {
    assert.equal(
      shouldAcceptSemrushCandidate({
        candidateOverall: 8.78,
        bestOverall: 8.9,
        candidateMissingKeywordCount: 2,
        bestMissingKeywordCount: 2,
        readabilityImproved: false,
        candidateHardSentenceHits: 1,
        bestHardSentenceHits: 3,
      }),
      true,
    );
  });
});

describe('isSemrushSurgicalTier', () => {
  it('activates at 8.8+', () => {
    assert.equal(isSemrushSurgicalTier(8.8), true);
    assert.equal(isSemrushSurgicalTier(8.79), false);
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
