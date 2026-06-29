/**
 * 关键词优先级评分单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/keyword-pool/keyword-priority.util.js'),
).href;
const {
  computeKeywordPriorityScore,
  normalizeDifficultyScore,
  normalizeSearchVolumeScore,
} = await import(utilPath);

describe('normalizeSearchVolumeScore', () => {
  it('returns 0.5 when missing', () => {
    assert.equal(normalizeSearchVolumeScore(null), 0.5);
  });

  it('ranks higher volume above lower volume', () => {
    assert.ok(normalizeSearchVolumeScore(1000) > normalizeSearchVolumeScore(10));
  });
});

describe('normalizeDifficultyScore', () => {
  it('prefers lower keyword difficulty', () => {
    assert.ok(normalizeDifficultyScore(20) > normalizeDifficultyScore(80));
  });
});

describe('computeKeywordPriorityScore', () => {
  it('scores strong keywords above weak ones', () => {
    const high = computeKeywordPriorityScore({
      businessValueScore: 0.9,
      contentFitScore: 0.9,
    });
    const low = computeKeywordPriorityScore({
      businessValueScore: 0.2,
      contentFitScore: 0.2,
    });
    assert.ok(high > low);
    assert.equal(high, 90);
    assert.equal(low, 20);
  });
});
