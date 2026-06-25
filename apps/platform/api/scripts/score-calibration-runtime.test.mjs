/**
 * 评分校准运行时决策单元测试。
 *
 * 运行：node apps/platform/api/scripts/score-calibration-runtime.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/project-types/seo-factory/utils');

const runtime = await import(pathToFileURL(resolve(distDir, 'score-calibration-runtime.util.js')).href);
const articleScore = await import(pathToFileURL(resolve(distDir, 'article-content-score.util.js')).href);

const model = {
  version: 3,
  intercept: 0.2,
  weights: {
    localScoreNorm: 8,
    keywordCoverageNorm: 0.5,
    serpNorm: 0.5,
    structureNorm: 0.5,
    readabilityNorm: 0.5,
    depthNorm: 0.5,
    wordCountNorm: 0.2,
    longSentenceNorm: -0.5,
    fleschNorm: 0.1,
    wordGapNorm: -0.3,
    missingKeywordsNorm: -0.2,
    semrushNodeNorm: 0.05,
  },
  sampleCount: 20,
  trainSampleCount: 20,
  mae: 0.25,
  rmse: 0.3,
  holdoutSampleCount: 8,
  holdoutMae: 0.28,
  holdoutPassSampleCount: 4,
  holdoutPassRecall: 0.75,
  holdoutPassPrecision: 0.75,
  trainedAt: new Date().toISOString(),
};

const highPassPrediction = {
  predictedSemrush: 9.2,
  confidence: 'high',
  modelSampleCount: 20,
  usedFallback: false,
};

const lowPrediction = {
  predictedSemrush: 8.0,
  confidence: 'high',
  modelSampleCount: 20,
  usedFallback: false,
};

const accept = runtime.resolveSemrushRecheckDecision({
  model,
  prediction: highPassPrediction,
  bestOverall: 8.7,
  candidateLocalScore: 96,
});
assert.equal(accept.action, 'skip_accept_proxy');

const reject = runtime.resolveSemrushRecheckDecision({
  model,
  prediction: lowPrediction,
  bestOverall: 8.7,
  candidateLocalScore: 96,
});
assert.equal(reject.action, 'skip_reject');

const proxy = runtime.buildCalibrationProxyScore(
  { overall: 8.7, suggestions: ['keep'] },
  9.1,
);
assert.equal(proxy.overall, 9.1);
assert.equal(proxy.calibrationProxy, true);

const localResult = {
  score: 92,
  breakdown: {
    keywordCoverage: 20,
    serpTermAlignment: 18,
    structure: 16,
    readability: 15,
    contentDepth: 8,
  },
  suggestions: ['add keywords'],
  recommendedKeywords: ['sleep'],
  metrics: {
    wordCount: 1200,
    fleschReadingEase: 55,
    longSentencesOver22: 2,
    longParagraphsOver65: 1,
  },
};

const unifiedPrediction = runtime.buildCalibrationPrediction({
  localResult,
  model,
  featureMeans: null,
  targetKeyword: 'magnesium for sleep',
  content: '# Magnesium\n\n'.repeat(20),
  competitorWordCount: 1400,
  missingKeywordCountOverride: 1,
});
assert.ok(unifiedPrediction.predictedSemrush >= 0);
assert.equal(typeof unifiedPrediction.usedFallback, 'boolean');

const fromLocal = articleScore.scoreArticleContentFromLocal({
  localResult,
  targetKeyword: 'magnesium for sleep',
  content: '# Magnesium\n\n'.repeat(20),
  model,
  competitorWordCount: 1400,
  missingKeywordCountOverride: 1,
});
assert.equal(unifiedPrediction.predictedSemrush, fromLocal.overall);

console.log('score-calibration-runtime.test.mjs: ok');
