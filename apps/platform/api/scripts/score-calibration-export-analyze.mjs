/**
 * 深度分析实验室导出的配对 JSON。
 *
 * 运行：
 *   node apps/platform/api/scripts/score-calibration-export-analyze.mjs <export.json>
 */

import { readFileSync } from 'node:fs';

const exportPath = process.argv[2];
if (!exportPath) {
  console.error('用法: node score-calibration-export-analyze.mjs <export.json>');
  process.exit(1);
}

const pairs = JSON.parse(readFileSync(exportPath, 'utf8'));
const sc = await import('@wm/shared-core');
const {
  trainScoreCalibrationModel,
  predictCalibratedSemrushScore,
  listScoreCalibrationModelWeights,
  resolveScoreCalibrationReadiness,
} = sc;

const rows = pairs.map((p) => ({
  features: p.features,
  semrushOverall: p.semrushOverall,
  jobId: p.jobId,
  localScore: p.localScore,
}));

const model = trainScoreCalibrationModel(rows);
const readiness = resolveScoreCalibrationReadiness({
  pairCount: pairs.length,
  jobCount: new Set(pairs.map((p) => p.jobId)).size,
  model,
});
const weights = listScoreCalibrationModelWeights(model);

const enriched = pairs.map((p) => {
  const pred = predictCalibratedSemrushScore({
    features: p.features,
    localScore: p.localScore,
    model,
  }).predictedSemrush;
  const naive = Math.round((p.localScore / 10) * 10) / 10;
  return {
    ...p,
    pred,
    naive,
    err: Math.abs(pred - p.semrushOverall),
    naiveErr: Math.abs(naive - p.semrushOverall),
  };
});

function avg(arr, fn) {
  return arr.length ? arr.reduce((s, x) => s + fn(x), 0) / arr.length : 0;
}
function avgFeat(arr, key) {
  return avg(arr, (p) => p.features[key]);
}

const local100 = enriched.filter((p) => p.localScore >= 100);
const falseHigh = enriched.filter((p) => p.localScore >= 95 && p.semrushOverall < 9);
const nearMiss = enriched.filter((p) => p.semrushOverall >= 8.5 && p.semrushOverall < 9);
const sem9 = enriched.filter((p) => p.semrushOverall >= 9);
const outliers = [...enriched].sort((a, b) => b.err - a.err).slice(0, 10);
const featureKeys = Object.keys(pairs[0]?.features ?? {});

console.log('=== 评分校准导出深度分析 ===');
console.log(`文件: ${exportPath}`);
console.log(`样本: ${pairs.length} · 任务: ${new Set(pairs.map((p) => p.jobId)).size}`);
console.log(`就绪: ${readiness.state} · Holdout MAE: ${readiness.holdoutMae ?? '—'}`);
console.log(`intercept: ${model?.intercept?.toFixed(3) ?? '—'}`);
console.log('');

console.log('=== 特征权重 Top 8（你们语料里 Sem 最吃这些）===');
for (const w of weights.slice(0, 8)) {
  console.log(`  ${w.label.padEnd(14)} weight ${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(3)}`);
}
console.log('');

console.log('=== 分数分布 ===');
console.log(`Semrush 真分 ≥9:     ${sem9.length}/${pairs.length} (${((sem9.length / pairs.length) * 100).toFixed(0)}%)`);
console.log(`Sem 8.5–8.9 near-miss: ${nearMiss.length}/${pairs.length}`);
console.log(`本地 ≥95 但 Sem<9:   ${falseHigh.length}/${pairs.length}（朴素 local/10 误放行 ${enriched.filter((p) => p.naive >= 9 && p.semrushOverall < 9).length}）`);
console.log(`本地 =100:           ${local100.length}，其中 Sem<9: ${local100.filter((p) => p.semrushOverall < 9).length}，Sem 均值 ${avg(local100, (p) => p.semrushOverall).toFixed(2)}`);
console.log(`平均误差 朴素/校准:  ${(avg(enriched, (p) => p.naiveErr)).toFixed(3)} / ${(avg(enriched, (p) => p.err)).toFixed(3)}`);
console.log('');

console.log('=== 本地≥95 但 Sem<9：特征 vs 全库（差>0.05 的维度）===');
for (const k of featureKeys) {
  const fh = avgFeat(falseHigh, k);
  const all = avgFeat(enriched, k);
  const s9 = avgFeat(sem9, k);
  if (Math.abs(fh - all) > 0.05 || Math.abs(fh - s9) > 0.08) {
    console.log(
      `  ${k.padEnd(22)} 误高 ${fh.toFixed(3)}  全库 ${all.toFixed(3)}  Sem≥9 ${s9.toFixed(3)}`,
    );
  }
}
console.log('');

console.log('=== near-miss 8.5–8.9 vs Sem≥9（改稿优先方向）===');
const compareKeys = [
  'serpNorm',
  'fleschNorm',
  'readabilityNorm',
  'wordCountNorm',
  'keywordCoverageNorm',
  'longSentenceNorm',
  'missingKeywordsNorm',
  'localScoreNorm',
];
for (const k of compareKeys) {
  console.log(
    `  ${k.padEnd(22)} near ${avgFeat(nearMiss, k).toFixed(3)}  sem9 ${avgFeat(sem9, k).toFixed(3)}  gap ${(avgFeat(sem9, k) - avgFeat(nearMiss, k)).toFixed(3)}`,
  );
}
console.log('');

console.log('=== 预测误差最大 Top 10（建议回 RPA 看侧栏）===');
for (const p of outliers) {
  console.log(
    `  Sem ${p.semrushOverall} pred ${p.pred} local ${p.localScore} err ${p.err.toFixed(2)} | ${p.targetKeyword}`,
  );
}
console.log('');

console.log('=== 本地100 样本明细 ===');
for (const p of local100.sort((a, b) => a.semrushOverall - b.semrushOverall)) {
  console.log(
    `  Sem ${p.semrushOverall} pred ${p.pred} | serp ${p.features.serpNorm.toFixed(2)} flesch ${p.features.fleschNorm.toFixed(2)} | ${p.targetKeyword.slice(0, 55)}`,
  );
}
