/**
 * 优化轮词数目标解析与扩写优先级单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const optimizeContextPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/llm/optimize-context.util.js'),
).href;
const alignPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/score-calibration-local-align.util.js'),
).href;

const {
  resolveOptimizeWordCountTarget,
  shouldPrioritizeWordCountExpand,
  OPTIMIZE_WORD_COUNT_EXPAND_GAP_THRESHOLD,
} = await import(optimizeContextPath);
const { resolveCalibratedOptimizeFocus } = await import(alignPath);

describe('resolveOptimizeWordCountTarget', () => {
  it('prefers Semrush competitor benchmark when available', () => {
    assert.equal(resolveOptimizeWordCountTarget(1500, 1084), 1084);
  });

  it('falls back to brief target when Semrush benchmark missing', () => {
    assert.equal(resolveOptimizeWordCountTarget(1400, undefined), 1400);
  });
});

describe('shouldPrioritizeWordCountExpand', () => {
  it(`requires gap > ${OPTIMIZE_WORD_COUNT_EXPAND_GAP_THRESHOLD}`, () => {
    assert.equal(shouldPrioritizeWordCountExpand(55), false);
    assert.equal(shouldPrioritizeWordCountExpand(56), true);
    assert.equal(shouldPrioritizeWordCountExpand(204), true);
  });
});

describe('resolveCalibratedOptimizeFocus word count expand', () => {
  it('sets wordCountExpandPriority when gap exceeds threshold', () => {
    const focus = resolveCalibratedOptimizeFocus({
      gate: { mode: 'calibrated', effective: true, threshold: 9 },
      localResult: {
        breakdown: {
          serpTermAlignment: 22,
          readability: 18,
          keywordCoverage: 23,
          structure: 12,
          contentDepth: 8,
        },
        metrics: { wordCount: 880 },
        recommendedKeywords: [],
      },
      pointsToGo: 0.3,
      competitorWordCount: 1084,
    });
    assert.equal(focus.wordCountExpandPriority, true);
    assert.equal(focus.readabilityPriority, false);
  });
});
