/**
 * Semrush 接近门槛时的额外改写轮次单元测试。
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
const { resolveSemrushOptimizeRoundCap } = await import(utilPath);
const {
  SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  SEMRUSH_NEAR_MISS_EXTRA_ROUNDS,
  SEMRUSH_RETRY_EXTRA_ROUNDS,
} = await import(scorePath);

describe('resolveSemrushOptimizeRoundCap', () => {
  it('adds near-miss rounds when score is 8.8/9.0', () => {
    assert.equal(
      resolveSemrushOptimizeRoundCap(8.8, 0, false),
      SEMRUSH_MAX_OPTIMIZE_ROUNDS + SEMRUSH_NEAR_MISS_EXTRA_ROUNDS,
    );
  });

  it('adds retry rounds after resume when regular rounds exhausted', () => {
    assert.equal(
      resolveSemrushOptimizeRoundCap(8.8, 4, true),
      Math.max(
        SEMRUSH_MAX_OPTIMIZE_ROUNDS + SEMRUSH_NEAR_MISS_EXTRA_ROUNDS,
        4 + SEMRUSH_RETRY_EXTRA_ROUNDS,
      ),
    );
  });

  it('uses base cap when score is far below threshold', () => {
    assert.equal(resolveSemrushOptimizeRoundCap(7.5, 0, false), SEMRUSH_MAX_OPTIMIZE_ROUNDS);
  });
});
