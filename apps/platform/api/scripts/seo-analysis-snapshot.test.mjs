/**
 * SEO 分析快照单元测试。
 *
 * 运行：node apps/platform/api/scripts/seo-analysis-snapshot.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/utils/seo-analysis-snapshot.util.js',
  ),
).href;

const { buildSemrushAnalysisSnapshot, appendSeoAnalysisSnapshot } = await import(utilPath);

const content = '# Smart BMS Guide\n\nBattery management systems help buyers choose safe packs.\n'.repeat(
  12,
);

const semrushResult = {
  overall: 7.4,
  skipped: false,
  node: 'keyword',
  nodeLabel: 'Keyword coverage',
  suggestions: ['Add more terms'],
  semrushCheckRecord: {
    contentHash: 'abc123',
    checkedAt: '2026-06-19T10:13:21.000Z',
    currentWordCount: 1200,
  },
};

const snapshot = buildSemrushAnalysisSnapshot({
  content,
  targetKeyword: 'smart bms',
  semrushResult,
  localResult: {
    score: 97,
    passed: true,
    breakdown: {
      keywordCoverage: 22,
      serpTermAlignment: 20,
      structure: 18,
      readability: 17,
      contentDepth: 9,
    },
    suggestions: [],
    metrics: { wordCount: 1200 },
    recommendedKeywords: ['smart bms'],
  },
  round: 4,
  rolledBack: true,
  includeFullContent: true,
});

assert.ok(snapshot.checkedAt);
assert.notEqual(snapshot.checkedAt, snapshot.rpaCheckedAt);
assert.equal(snapshot.rpaCheckedAt, '2026-06-19T10:13:21.000Z');
assert.equal(snapshot.semrushOverall, 7.4);
assert.equal(snapshot.rolledBack, true);

const base = { analysisSnapshots: [] };
const once = appendSeoAnalysisSnapshot(base, snapshot);
const twice = appendSeoAnalysisSnapshot(once, {
  ...snapshot,
  id: 'semrush-dup',
  checkedAt: new Date().toISOString(),
});
assert.equal(once.analysisSnapshots.length, 1);
assert.equal(twice.analysisSnapshots.length, 1, 'same RPA should dedupe');

const differentRpa = appendSeoAnalysisSnapshot(
  once,
  buildSemrushAnalysisSnapshot({
    content,
    targetKeyword: 'smart bms',
    semrushResult: {
      ...semrushResult,
      overall: 8.1,
      semrushCheckRecord: {
        ...semrushResult.semrushCheckRecord,
        checkedAt: '2026-06-19T10:20:00.000Z',
      },
    },
    localResult: {
      score: 96,
      passed: true,
      breakdown: snapshot.localBreakdown,
      suggestions: [],
      metrics: { wordCount: 1200 },
      recommendedKeywords: ['smart bms'],
    },
    round: 5,
    includeFullContent: true,
  }),
);
assert.equal(differentRpa.analysisSnapshots.length, 2, 'new RPA run should append');

console.log('seo-analysis-snapshot.test.mjs: ok');
