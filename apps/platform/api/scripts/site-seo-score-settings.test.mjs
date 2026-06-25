/**
 * 站点评分配置解析单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/site-seo-score-settings.js'),
).href;
const { resolveSiteSeoScoreConfig, DEFAULT_SITE_SEO_SCORE_CONFIG } = await import(utilPath);

describe('resolveSiteSeoScoreConfig', () => {
  it('returns platform defaults when unset', () => {
    assert.deepEqual(resolveSiteSeoScoreConfig({}), DEFAULT_SITE_SEO_SCORE_CONFIG);
    assert.equal(DEFAULT_SITE_SEO_SCORE_CONFIG.localPassThreshold, 95);
    assert.equal(DEFAULT_SITE_SEO_SCORE_CONFIG.semrushPassThreshold, 9.0);
  });

  it('clamps custom thresholds and rounds', () => {
    const cfg = resolveSiteSeoScoreConfig({
      localPassThreshold: 120,
      semrushPassThreshold: 6.5,
      localMaxOptimizeRounds: 99,
      localRetryExtraRounds: -1,
      semrushMaxOptimizeRounds: 0,
      semrushRetryExtraRounds: 20,
    });
    assert.equal(cfg.localPassThreshold, 100);
    assert.equal(cfg.semrushPassThreshold, 7.0);
    assert.equal(cfg.localMaxOptimizeRounds, 15);
    assert.equal(cfg.localRetryExtraRounds, 0);
    assert.equal(cfg.semrushMaxOptimizeRounds, 1);
    assert.equal(cfg.semrushRetryExtraRounds, 10);
  });
});

describe('hasExplicitLocalPassThreshold', () => {
  it('detects explicit local pass threshold only', async () => {
    const { hasExplicitLocalPassThreshold } = await import(utilPath);
    assert.equal(hasExplicitLocalPassThreshold({}), false);
    assert.equal(hasExplicitLocalPassThreshold({ semrushMaxOptimizeRounds: 1 }), false);
    assert.equal(hasExplicitLocalPassThreshold({ localPassThreshold: 85 }), true);
  });
});

describe('hasExplicitSiteSeoScoreSettings', () => {
  it('returns true when any score field is set', async () => {
    const { hasExplicitSiteSeoScoreSettings } = await import(utilPath);
    assert.equal(hasExplicitSiteSeoScoreSettings({}), false);
    assert.equal(hasExplicitSiteSeoScoreSettings({ semrushMaxOptimizeRounds: 1 }), true);
  });
});

describe('strict round cap', () => {
  it('does not add near-miss bonus when strictCap is true', async () => {
    const { resolveSemrushOptimizeRoundCap } = await import(
      pathToFileURL(resolve(apiRoot, 'dist/project-types/seo-factory/utils/seo-pipeline.util.js')).href
    );
    const cap = resolveSemrushOptimizeRoundCap(8.6, 0, false, {
      localPassThreshold: 75,
      semrushPassThreshold: 7.5,
      localMaxOptimizeRounds: 1,
      localRetryExtraRounds: 1,
      semrushMaxOptimizeRounds: 1,
      semrushRetryExtraRounds: 1,
    }, { strictCap: true });
    assert.equal(cap, 1);
  });
});
