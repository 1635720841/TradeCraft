/**
 * 流程 RPA 配对排除单元测试。
 *
 * 运行：node apps/platform/api/scripts/score-calibration-pair-exclusion.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const pairsPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/utils/score-calibration-pairs.util.js',
  ),
).href;
const exclusionPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/utils/score-calibration-pair-exclusion.util.js',
  ),
).href;

const { extractScoreCalibrationPairs, extractExcludedScoreCalibrationPairs } =
  await import(pairsPath);
const {
  findCalibrationSnapshotById,
  isWorkflowCalibrationPairSnapshot,
  setWorkflowPairCalibrationExcluded,
} = await import(exclusionPath);

const snapshot = {
  id: 'snap-1',
  kind: 'semrush_check',
  checkedAt: '2026-06-20T10:00:00.000Z',
  title: 'Test Article',
  targetKeyword: 'magnesium sleep',
  contentHash: 'abc',
  contentWordCount: 500,
  contentPreview: 'preview',
  localScore: 82,
  semrushOverall: 7.8,
};

const job = {
  id: 'job-1',
  traceId: 'trace-1',
  targetKeyword: 'magnesium sleep',
  seoCheckData: {
    analysisSnapshots: [snapshot],
  },
};

const active = extractScoreCalibrationPairs([job]);
assert.equal(active.pairs.length, 1);
assert.equal(active.meta.excludedPairCount, 0);

const patched = setWorkflowPairCalibrationExcluded({
  seoCheckData: job.seoCheckData,
  snapshotId: 'snap-1',
  excluded: true,
});
assert.equal(patched.snapshot.excludedFromCalibration, true);

const excludedJob = { ...job, seoCheckData: patched.seoCheckData };
const afterExclude = extractScoreCalibrationPairs([excludedJob]);
assert.equal(afterExclude.pairs.length, 0);
assert.equal(afterExclude.meta.excludedPairCount, 1);

const excludedList = extractExcludedScoreCalibrationPairs([excludedJob]);
assert.equal(excludedList.length, 1);
assert.equal(excludedList[0].snapshotId, 'snap-1');

const restored = setWorkflowPairCalibrationExcluded({
  seoCheckData: patched.seoCheckData,
  snapshotId: 'snap-1',
  excluded: false,
});
const afterRestore = extractScoreCalibrationPairs([
  { ...job, seoCheckData: restored.seoCheckData },
]);
assert.equal(afterRestore.pairs.length, 1);

assert.equal(findCalibrationSnapshotById(job.seoCheckData, 'snap-1')?.id, 'snap-1');
assert.equal(isWorkflowCalibrationPairSnapshot(snapshot), true);
assert.equal(isWorkflowCalibrationPairSnapshot({ ...snapshot, kind: 'semrush_manual_check' }), false);

console.log('score-calibration-pair-exclusion.test.mjs: ok');
