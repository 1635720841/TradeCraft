/**
 * 校准训练卫生工具单元测试。
 *
 * 运行：node apps/platform/api/scripts/score-calibration-training-hygiene.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/shared-core/dist/seo/score-calibration-training-hygiene.util.js',
  ),
).href;

const {
  buildCalibrationLabelWarning,
  calibrationKeywordSimilarity,
  detectCalibrationPairOutliers,
} = await import(utilPath);

assert.equal(buildCalibrationLabelWarning(8.5, 9.2), null);
assert.ok(buildCalibrationLabelWarning(7.8, 9.5)?.includes('1.7'));

assert.ok(calibrationKeywordSimilarity('smart bms guide', 'smart bms buyer guide') > 0.3);
assert.ok(calibrationKeywordSimilarity('smart bms', 'teeth cleaning soho') < 0.12);

const mixed = [
  'clear aligners soho',
  'invisalign soho',
  'dental cleaning soho',
  'veneers soho',
  'cosmetic dentist soho',
  'smart bms buyer guide',
];
const outliers = detectCalibrationPairOutliers(mixed);
assert.equal(outliers.length, 1);
assert.equal(mixed[outliers[0].index], 'smart bms buyer guide');

assert.equal(detectCalibrationPairOutliers(['a', 'b', 'c']).length, 0);

console.log('score-calibration-training-hygiene.test.mjs: ok');
