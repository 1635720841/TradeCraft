/**
 * 快照 Semrush 上下文回填单元测试。
 *
 * 运行：node apps/platform/api/scripts/score-calibration-snapshot-context.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/utils/score-calibration-snapshot-context.util.js',
  ),
).href;

const { resolveSnapshotSemrushContext, resolveSnapshotContent } = await import(utilPath);

const keyword = 'magnesium for sleep';
const content =
  '# Magnesium for Sleep\n\nMagnesium helps sleep quality. Many people use magnesium supplements nightly.\n'.repeat(
    6,
  );

assert.ok(resolveSnapshotContent({ contentPreview: 'short' }).length > 0);

const resolved = resolveSnapshotSemrushContext(
  {
    id: 's1',
    kind: 'semrush_check',
    checkedAt: new Date().toISOString(),
    title: 'Magnesium for Sleep',
    targetKeyword: keyword,
    submittedKeywords: [keyword, 'magnesium supplement', 'sleep quality aid'],
    contentHash: 'abc',
    contentWordCount: 120,
    contentPreview: content.slice(0, 200),
    content,
    semrushCompetitorWordCount: 1500,
    semrushNode: 'Keyword coverage',
  },
  keyword,
);

assert.equal(resolved.missingKeywordsBackfilled, true);
assert.ok((resolved.context.missingKeywordCount ?? 0) >= 1);
assert.equal(resolved.context.semrushNode, 'Keyword coverage');

const persisted = resolveSnapshotSemrushContext(
  {
    id: 's2',
    kind: 'semrush_check',
    checkedAt: new Date().toISOString(),
    title: 'Test',
    targetKeyword: keyword,
    contentHash: 'abc',
    contentWordCount: 120,
    contentPreview: content.slice(0, 200),
    semrushMissingKeywordCount: 2,
  },
  keyword,
);

assert.equal(persisted.missingKeywordsBackfilled, false);
assert.equal(persisted.context.missingKeywordCount, 2);

console.log('score-calibration-snapshot-context.test.mjs: ok');
