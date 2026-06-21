/**
 * 手动录入校准样本 util 单测。
 */
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const utilPath = pathToFileURL(
  resolve(root, '../dist/project-types/seo-factory/utils/score-calibration-manual-samples.util.js'),
).href;
const snapshotUtilPath = pathToFileURL(
  resolve(root, '../dist/project-types/seo-factory/utils/seo-analysis-snapshot.util.js'),
).href;
const pairsUtilPath = pathToFileURL(
  resolve(root, '../dist/project-types/seo-factory/utils/score-calibration-pairs.util.js'),
).href;

const {
  buildCalibrationLabJobId,
  CALIBRATION_LAB_IMPORT_FLAG,
  clearManualCalibrationSamplesConfig,
  isCalibrationLabImportSeoCheckData,
  readManualCalibrationSamples,
  SCORE_CALIBRATION_MANUAL_SAMPLES_KEY,
} = await import(utilPath);
const { buildSemrushAnalysisSnapshot } = await import(snapshotUtilPath);
const { extractScoreCalibrationPairs } = await import(pairsUtilPath);

assert.match(buildCalibrationLabJobId(), /^lab-manual-/);
assert.equal(isCalibrationLabImportSeoCheckData({ [CALIBRATION_LAB_IMPORT_FLAG]: true }), true);
assert.equal(isCalibrationLabImportSeoCheckData({}), false);

const snapshot = buildSemrushAnalysisSnapshot({
  content: '# Magnesium for Sleep\n\nMagnesium helps sleep quality in many adults.',
  targetKeyword: 'magnesium for sleep',
  semrushResult: { overall: 8.6, suggestions: [], analysisSource: 'dom' },
  localResult: {
    score: 92,
    breakdown: {
      keywordCoverage: 20,
      serpTermAlignment: 18,
      structure: 16,
      readability: 17,
      contentDepth: 8,
    },
    metrics: {
      keywordDensity: 1.2,
      matchedSerpTerms: 4,
      totalSerpTerms: 6,
      h2Count: 3,
      wordCount: 420,
      fleschReadingEase: 62,
      longSentencesOver22: 2,
      longParagraphsOver65: 1,
    },
    suggestions: [],
    recommendedKeywords: [],
  },
  kind: 'semrush_manual_check',
  includeFullContent: true,
});

const legacyConfig = {
  [SCORE_CALIBRATION_MANUAL_SAMPLES_KEY]: [
    {
      jobId: 'lab-manual-test-1',
      traceId: 'lab-manual-test-1',
      importedAt: new Date().toISOString(),
      snapshot,
    },
  ],
};

assert.equal(readManualCalibrationSamples(legacyConfig).length, 1);
assert.equal(clearManualCalibrationSamplesConfig(legacyConfig)[SCORE_CALIBRATION_MANUAL_SAMPLES_KEY], undefined);

const jobSource = {
  id: 'lab-manual-test-1',
  traceId: 'lab-manual-test-1',
  targetKeyword: 'magnesium for sleep',
  seoCheckData: {
    [CALIBRATION_LAB_IMPORT_FLAG]: true,
    analysisSnapshots: [snapshot],
  },
};
const { pairs } = extractScoreCalibrationPairs([jobSource]);
assert.equal(pairs.length, 1);
assert.equal(pairs[0].semrushOverall, 8.6);

console.log('score-calibration-manual-samples.test.mjs OK');
