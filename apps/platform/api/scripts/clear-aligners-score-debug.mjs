/**
 * Clear aligners 短文 SWA 对齐回归：应接近 Semrush 9.2，不应虚高 9.57。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core/dist/seo');
const fixture = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/clear-aligners-article.txt'),
  'utf8',
);

const { normalizeArticleScoreContent } = await import(pathToFileURL(`${root}/article-score-content.util.js`).href);
const { scoreLocalSeo } = await import(pathToFileURL(`${root}/local-seo-score.js`).href);
const { buildCalibrationFeatures, estimateSemrushOverallFromFeatures } = await import(
  pathToFileURL(`${root}/score-calibration-model.js`).href,
);

const { inferSemrushWordCountTarget } = await import(
  pathToFileURL(`${root}/semrush-readability-align.util.js`).href,
);

const content = normalizeArticleScoreContent(fixture);
const local = scoreLocalSeo({
  keyword: 'clear aligners in soho',
  submittedKeywords: ['invisalign in soho'],
  content,
});

const inferredTarget = inferSemrushWordCountTarget(local.metrics.wordCount);
const features = buildCalibrationFeatures({
  localScore: local.score,
  breakdown: local.breakdown,
  metrics: local.metrics,
  semrushContext: { missingKeywordCount: 0, targetWordCount: inferredTarget },
});

const overall = estimateSemrushOverallFromFeatures(features, local.score);

assert.ok(
  overall >= 8.9 && overall <= 9.35,
  `clear aligners overall ${overall} expected 8.9-9.35 (Semrush ~9.2)`,
);
assert.ok(
  features.wordGapNorm <= 0.35,
  `wordGapNorm should reflect SWA inferred target, got ${features.wordGapNorm}`,
);
console.log('clear-aligners-score-debug.mjs: ok', { overall, local: local.score, wordCount: local.metrics.wordCount });
