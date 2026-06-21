/**
 * 校准特征 v2 单元测试：词数缺口、缺词数、Semrush 节点。
 *
 * 运行：node apps/platform/api/scripts/score-calibration-features.test.mjs
 */

import assert from 'node:assert/strict';

const {
  buildCalibrationFeatures,
  encodeSemrushNodeNorm,
  trainScoreCalibrationModel,
  computeScoreCalibrationFeatureMeans,
  attributeScoreCalibrationDrivers,
} = await import('@wm/shared-core');

assert.equal(encodeSemrushNodeNorm(undefined), 0);
assert.equal(encodeSemrushNodeNorm('Readability hard to read'), 0.85);
assert.equal(encodeSemrushNodeNorm('Keyword coverage'), 0.65);

const features = buildCalibrationFeatures({
  localScore: 92,
  breakdown: {
    keywordCoverage: 20,
    serpTermAlignment: 18,
    structure: 16,
    readability: 15,
    contentDepth: 8,
  },
  metrics: {
    wordCount: 900,
    keywordDensity: 1.2,
    matchedSerpTerms: 4,
    totalSerpTerms: 6,
    h2Count: 5,
    longSentencesOver22: 2,
    longParagraphsOver65: 1,
    passiveVoiceHits: 0,
    fleschReadingEase: 48,
  },
  semrushContext: {
    competitorWordCount: 1200,
    missingKeywordCount: 3,
    semrushNode: 'Keyword coverage',
  },
});

assert.ok(features.wordGapNorm > 0, 'wordGapNorm should reflect competitor gap');
assert.ok(features.missingKeywordsNorm > 0, 'missingKeywordsNorm should reflect missing keywords');
assert.equal(features.semrushNodeNorm, 0.65);

const shortFeatures = buildCalibrationFeatures({
  localScore: 68,
  breakdown: {
    keywordCoverage: 24,
    serpTermAlignment: 20,
    structure: 8,
    readability: 18,
    contentDepth: 6,
  },
  metrics: {
    wordCount: 695,
    keywordDensity: 1,
    matchedSerpTerms: 0,
    totalSerpTerms: 0,
    h2Count: 4,
    longSentencesOver22: 4,
    longParagraphsOver65: 0,
    passiveVoiceHits: 0,
    fleschReadingEase: 52,
  },
  semrushContext: { missingKeywordCount: 0, targetWordCount: 792 },
});
assert.ok(
  shortFeatures.wordGapNorm <= 0.35,
  `short article wordGapNorm should use inferred target, got ${shortFeatures.wordGapNorm}`,
);

const rows = Array.from({ length: 12 }, (_, index) => ({
  jobId: `job-${index}`,
  semrushOverall: 8 + (index % 3) * 0.3,
  features: buildCalibrationFeatures({
    localScore: 90 + index,
    breakdown: {
      keywordCoverage: 20,
      serpTermAlignment: 18,
      structure: 16,
      readability: 15,
      contentDepth: 8,
    },
    metrics: {
      wordCount: 800 + index * 10,
      keywordDensity: 1,
      matchedSerpTerms: 4,
      totalSerpTerms: 6,
      h2Count: 5,
      longSentencesOver22: 1,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      fleschReadingEase: 50,
    },
    semrushContext: {
      competitorWordCount: 1100,
      missingKeywordCount: index % 4,
      semrushNode: index % 2 === 0 ? 'Readability' : 'Keywords',
    },
  }),
}));

const model = trainScoreCalibrationModel(rows);
assert.ok(model, 'model should train with v2 features');
assert.equal(model.version, 2);
assert.ok(typeof model.weights.wordGapNorm === 'number');

const means = computeScoreCalibrationFeatureMeans(rows.map((row) => row.features));
const drivers = attributeScoreCalibrationDrivers({
  model,
  features: rows[0].features,
  featureMeans: means,
  limit: 3,
});
assert.equal(drivers.length, 3);
assert.ok(drivers[0].label);

console.log('score-calibration-features.test.mjs: ok');
