/**
 * 本地 SEO 接近门槛时的额外改写轮次单元测试。
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
const { resolveLocalOptimizeRoundCap } = await import(utilPath);
const {
  LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS,
  LOCAL_SEO_PASS_THRESHOLD,
  LOCAL_SEO_RETRY_EXTRA_ROUNDS,
} = await import(scorePath);

describe('resolveLocalOptimizeRoundCap', () => {
  it('adds near-miss rounds when score is 94/95', () => {
    assert.equal(
      resolveLocalOptimizeRoundCap(94, 5, false),
      LOCAL_SEO_MAX_OPTIMIZE_ROUNDS + LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS + 2,
    );
  });

  it('adds retry rounds after resume when regular rounds exhausted', () => {
    assert.equal(
      resolveLocalOptimizeRoundCap(94, 5, true),
      Math.max(
        LOCAL_SEO_MAX_OPTIMIZE_ROUNDS + LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS + 2,
        5 + LOCAL_SEO_RETRY_EXTRA_ROUNDS,
      ),
    );
  });

  it('uses base cap when score is far below threshold', () => {
    assert.equal(resolveLocalOptimizeRoundCap(80, 0, false), LOCAL_SEO_MAX_OPTIMIZE_ROUNDS);
  });

  it('adds +2 rounds exactly at threshold minus 1', () => {
    assert.equal(
      resolveLocalOptimizeRoundCap(LOCAL_SEO_PASS_THRESHOLD - 1, 0, false),
      LOCAL_SEO_MAX_OPTIMIZE_ROUNDS + LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS + 2,
    );
  });
});
