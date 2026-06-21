/**
 * Laser gum 短文 SWA 对齐：应接近 Semrush 9.6（侧栏目标 ~887 词）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core/dist/seo');
const fixture = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/laser-gum-article.txt'),
  'utf8',
);

const { normalizeArticleScoreContent } = await import(pathToFileURL(`${root}/article-score-content.util.js`).href);
const { scoreLocalSeo } = await import(pathToFileURL(`${root}/local-seo-score.js`).href);
const { inferSemrushWordCountTarget } = await import(
  pathToFileURL(`${root}/semrush-readability-align.util.js`).href,
);
const { buildCalibrationFeatures, estimateSemrushOverallFromFeatures } = await import(
  pathToFileURL(`${root}/score-calibration-model.js`).href,
);

const content = normalizeArticleScoreContent(fixture);
const local = scoreLocalSeo({
  keyword: 'laser gum in soho',
  submittedKeywords: ['laser gum contouring in soho'],
  content,
});

const inferredTarget = inferSemrushWordCountTarget(local.metrics.wordCount);
const features = buildCalibrationFeatures({
  localScore: local.score,
  breakdown: local.breakdown,
  metrics: local.metrics,
  semrushContext: {
    missingKeywordCount: 0,
    targetWordCount: inferredTarget,
  },
});

const overall = estimateSemrushOverallFromFeatures(features, local.score);

assert.ok(
  overall >= 9.35 && overall <= 9.65,
  `laser gum overall ${overall} expected 9.35-9.65 (Semrush ~9.6)`,
);
assert.ok(
  inferredTarget >= 850 && inferredTarget <= 920,
  `inferred target ${inferredTarget} expected ~887 band`,
);
console.log('laser-gum-score-debug.mjs: ok', {
  overall,
  local: local.score,
  wordCount: local.metrics.wordCount,
  inferredTarget,
});
