/**
 * 本地预检对齐 Semrush 单元测试。
 *
 * 运行：node apps/platform/api/scripts/score-calibration-local-align.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/project-types/seo-factory/utils');

const align = await import(
  pathToFileURL(resolve(distDir, 'score-calibration-local-align.util.js')).href
);

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
  sampleCount: 40,
  trainSampleCount: 40,
  mae: 0.25,
  rmse: 0.3,
  holdoutSampleCount: 16,
  holdoutMae: 0.27,
  holdoutPassSampleCount: 4,
  holdoutPassRecall: 0.75,
  holdoutPassPrecision: 0.75,
  trainedAt: new Date().toISOString(),
};

assert.equal(
  align.resolveLocalAlignEffective({ localAlignEnabled: true, model }),
  true,
);
assert.equal(
  align.resolveLocalAlignEffective({ localAlignEnabled: false, model }),
  false,
);
assert.equal(
  align.resolveLocalAlignEffective({
    localAlignEnabled: true,
    model: { ...model, holdoutPassRecall: 0.25 },
  }),
  false,
);

const safeLegacyGate = align.resolveLocalGateContext({
  localAlignEnabled: true,
  localAlignEffective: false,
  scoreConfig: {
    localPassThreshold: 75,
    semrushPassThreshold: 9,
    localMaxOptimizeRounds: 5,
    localRetryExtraRounds: 3,
    semrushMaxOptimizeRounds: 4,
    semrushRetryExtraRounds: 4,
  },
});
assert.equal(safeLegacyGate.threshold, 95);

const explicitLegacyGate = align.resolveLocalGateContext({
  localAlignEnabled: true,
  localAlignEffective: false,
  explicitLocalPassThreshold: true,
  scoreConfig: {
    localPassThreshold: 75,
    semrushPassThreshold: 9,
    localMaxOptimizeRounds: 5,
    localRetryExtraRounds: 3,
    semrushMaxOptimizeRounds: 4,
    semrushRetryExtraRounds: 4,
  },
});
assert.equal(explicitLegacyGate.threshold, 75);

assert.equal(
  align.shouldAcceptLocalGateCandidate({
    gate: { mode: 'calibrated', effective: true, threshold: 9 },
    candidateLocalScore: 99,
    bestLocalScore: 95,
    candidatePredicted: 8.18,
    bestPredicted: 8.29,
    candidateKeywordCoverage: 25,
    bestKeywordCoverage: 25,
    nearMiss: false,
    readabilityImproved: false,
    candidateSerpAlignment: 24,
    bestSerpAlignment: 21,
  }),
  true,
);

const calibratedGate = align.resolveLocalGateContext({
  localAlignEnabled: true,
  localAlignEffective: true,
  scoreConfig: {
    localPassThreshold: 95,
    semrushPassThreshold: 7.5,
    localMaxOptimizeRounds: 5,
    localRetryExtraRounds: 3,
    semrushMaxOptimizeRounds: 4,
    semrushRetryExtraRounds: 4,
  },
});
assert.equal(calibratedGate.mode, 'calibrated');
assert.equal(calibratedGate.threshold, 7.5);

const prediction = {
  predictedSemrush: 7.6,
  confidence: 'high',
  modelSampleCount: 40,
  usedFallback: false,
};

assert.equal(
  align.isLocalGatePassed({
    gate: calibratedGate,
    localScore: 99,
    prediction,
  }),
  true,
);
assert.equal(
  align.isLocalGatePassed({
    gate: calibratedGate,
    localScore: 99,
    prediction: { ...prediction, predictedSemrush: 7.2 },
  }),
  false,
);

assert.equal(
  align.shouldSkipLocalOptimizationAligned(99, { local: { predictedSemrush: 7.8, gateMode: 'calibrated' } }, calibratedGate),
  true,
);

assert.equal(
  align.isLocalGateSoftPass({
    gate: calibratedGate,
    prediction: { ...prediction, predictedSemrush: 8.28 },
  }),
  true,
);

const serpFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 15, keywordCoverage: 25, readability: 18, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 0,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 0,
    },
    recommendedKeywords: ['bms cell'],
  },
  pointsToGo: 0.8,
});
assert.equal(serpFocus.serpPriority, true);
assert.equal(serpFocus.readabilityPriority, false);

const readFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 25, keywordCoverage: 25, readability: 14, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 4,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 2,
      hardToReadSentenceHits: 1,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 0.5,
});
assert.equal(readFocus.serpPriority, false);
assert.equal(readFocus.readabilityPriority, true);

const fleschFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 25, keywordCoverage: 25, readability: 16, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 0,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 2,
      fleschReadingEase: 40,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 0.8,
});
assert.equal(fleschFocus.fleschPriority, true);
assert.equal(fleschFocus.serpPriority, false);

const serp20FleschGap = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 20, keywordCoverage: 25, readability: 18, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 0,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 2,
      fleschReadingEase: 41.6,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 0.83,
});
assert.equal(serp20FleschGap.serpPriority, false);
assert.equal(serp20FleschGap.fleschPriority, true);

const hardSentenceFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 25, keywordCoverage: 25, readability: 16, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 0,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 3,
      fleschReadingEase: 43.5,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 0.88,
});
assert.equal(hardSentenceFocus.hardSentencePriority, true);
assert.equal(hardSentenceFocus.fleschPriority, false);
assert.equal(hardSentenceFocus.readabilityPriority, false);

const fleschSoftGapFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 25, keywordCoverage: 25, readability: 18, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 0,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 2,
      fleschReadingEase: 43.5,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 0.88,
});
assert.equal(fleschSoftGapFocus.hardSentencePriority, false);
assert.equal(fleschSoftGapFocus.fleschPriority, true);

const longTitle =
  'BMS Insulation Monitoring Devices for Battery Management Systems and Fleet Operations Guide';
const titleFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 25, keywordCoverage: 25, readability: 20, structure: 20, contentDepth: 10 },
    metrics: {
      longSentencesOver22: 0,
      longParagraphsOver65: 0,
      passiveVoiceHits: 0,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 0,
      fleschReadingEase: 50,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 1.2,
  content: `# ${longTitle}\n\nBody text.`,
  targetKeyword: 'bms insulation monitoring',
});
assert.equal(titleFocus.titlePriority, true);
assert.equal(titleFocus.hardSentencePriority, false);
assert.equal(titleFocus.fleschPriority, false);

const trimFocus = align.resolveCalibratedOptimizeFocus({
  gate: calibratedGate,
  localResult: {
    breakdown: { serpTermAlignment: 25, keywordCoverage: 25, readability: 18, structure: 16, contentDepth: 10 },
    metrics: {
      wordCount: 1850,
      longSentencesOver22: 1,
      longParagraphsOver65: 0,
      passiveVoiceHits: 2,
      semrushComplexWordHits: 0,
      hardToReadSentenceHits: 0,
      fleschReadingEase: 50,
    },
    recommendedKeywords: [],
  },
  pointsToGo: 0.8,
  competitorWordCount: 1500,
});
assert.equal(trimFocus.wordCountTrimPriority, true);
assert.equal(trimFocus.serpPriority, false);
assert.equal(trimFocus.readabilityPriority, false);

assert.equal(
  align.isLocalGateSoftPass({
    gate: { ...calibratedGate, threshold: 9 },
    prediction: { ...prediction, predictedSemrush: 8.17 },
    localScore: 96,
    localPassThreshold: 95,
  }),
  true,
);

assert.equal(
  align.shouldDeferCalibratedGateToSemrushRpa({
    gate: calibratedGate,
    localResult: { score: 95 },
    prediction: { ...prediction, predictedSemrush: 7.29 },
  }),
  true,
);
assert.equal(
  align.shouldDeferCalibratedGateToSemrushRpa({
    gate: calibratedGate,
    localResult: { score: 94 },
    prediction: { ...prediction, predictedSemrush: 7.29 },
  }),
  false,
);
assert.equal(
  align.shouldDeferCalibratedGateToSemrushRpa({
    gate: calibratedGate,
    localResult: { score: 96 },
    prediction: { ...prediction, predictedSemrush: 7.6 },
  }),
  false,
);

console.log('score-calibration-local-align.test.mjs: all passed');
