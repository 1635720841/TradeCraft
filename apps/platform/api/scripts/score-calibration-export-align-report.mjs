/**
 * 用实验室导出的训练集 JSON 验证「本地对齐 Sem」是否可用。
 *
 * 运行：
 *   node apps/platform/api/scripts/score-calibration-export-align-report.mjs "D:/path/score-calibration-xxx.json" [semrushPassThreshold]
 *
 * 说明：导出文件与 DB 里 extractScoreCalibrationPairs 同源；无需再导入，开设置即可。
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exportPath = process.argv[2];
const passThreshold = Number(process.argv[3] ?? '7.5');

if (!exportPath) {
  console.error('用法: node score-calibration-export-align-report.mjs <export.json> [7.5]');
  process.exit(1);
}

const pairs = JSON.parse(readFileSync(exportPath, 'utf8'));
if (!Array.isArray(pairs) || pairs.length === 0) {
  console.error('导出文件为空或格式不对');
  process.exit(1);
}

const sharedCore = await import('@wm/shared-core');
const {
  trainScoreCalibrationModel,
  predictCalibratedSemrushScore,
  resolveScoreCalibrationReadiness,
} = sharedCore;

const trainingRows = pairs.map((row) => ({
  features: row.features,
  semrushOverall: row.semrushOverall,
  jobId: row.jobId,
}));

const model = trainScoreCalibrationModel(trainingRows);
const readiness = resolveScoreCalibrationReadiness({
  pairCount: pairs.length,
  jobCount: new Set(pairs.map((p) => p.jobId)).size,
  model,
});

let naiveAbs = 0;
let modelAbs = 0;
let naivePass = 0;
let modelPass = 0;
let semPass = 0;
let falsePassNaive = 0;
let falsePassModel = 0;

for (const row of pairs) {
  const naive = Math.round((row.localScore / 10) * 10) / 10;
  naiveAbs += Math.abs(naive - row.semrushOverall);
  const pred = predictCalibratedSemrushScore({
    features: row.features,
    localScore: row.localScore,
    model,
  }).predictedSemrush;
  modelAbs += Math.abs(pred - row.semrushOverall);

  const semOk = row.semrushOverall >= passThreshold;
  if (semOk) semPass += 1;
  if (naive >= passThreshold) {
    naivePass += 1;
    if (!semOk) falsePassNaive += 1;
  }
  if (pred >= passThreshold) {
    modelPass += 1;
    if (!semOk) falsePassModel += 1;
  }
}

const n = pairs.length;
console.log('=== 评分校准导出对齐报告 ===');
console.log(`样本数: ${n} · Semrush 通过线: ${passThreshold}`);
console.log(`就绪状态: ${readiness.state} · Holdout MAE: ${readiness.holdoutMae ?? '—'}`);
console.log(`朴素 local/10 平均误差: ${(naiveAbs / n).toFixed(3)}`);
console.log(`校准模型平均误差: ${(modelAbs / n).toFixed(3)}`);
console.log('');
console.log(`Semrush 真分 ≥ ${passThreshold}: ${semPass}/${n}`);
console.log(`朴素 local/10 ≥ ${passThreshold}: ${naivePass}/${n}（误放行 ${falsePassNaive}）`);
console.log(`校准预测 ≥ ${passThreshold}: ${modelPass}/${n}（误放行 ${falsePassModel}）`);
console.log('');
console.log(
  readiness.state === 'production_ready'
    ? '✓ 可开设置「本地对齐 Sem」+ Semrush 通过线，本地进门闸将与 Sem 同线。'
    : '✗ 样本/MAE 未达 production_ready，请先补 RPA 配对或排查 holdout。',
);
