/**
 * content-score-publish 单元测试。
 *
 * 运行：node apps/platform/api/scripts/content-score-publish.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/shared-core/dist/seo/content-score-publish.util.js',
  ),
).href;

const {
  hashArticleContentFingerprint,
  canContentScoreSubstituteSemrushStale,
} = await import(utilPath);

const content = '# Title\n\nBody text for scoring trial.';
const hash = hashArticleContentFingerprint(content);
assert.equal(hash, hashArticleContentFingerprint(content));

const snapshot = {
  overall: 9.2,
  passed: true,
  passThreshold: 9,
  pointsToGo: 0,
  confidence: 'high',
  modelReady: true,
  usedFallback: false,
  localScore: 96,
  primaryNode: { key: 'keyword', label: '关键词', hint: 'ok' },
  missingKeywordCount: 0,
  contentHash: hash,
  scoredAt: new Date().toISOString(),
  source: 'draft_editor',
};

assert.equal(
  canContentScoreSubstituteSemrushStale({
    snapshot,
    currentContent: content,
    reduceRpaEnabled: true,
  }),
  true,
);

assert.equal(
  canContentScoreSubstituteSemrushStale({
    snapshot,
    currentContent: content,
    reduceRpaEnabled: false,
  }),
  false,
);

assert.equal(
  canContentScoreSubstituteSemrushStale({
    snapshot,
    currentContent: `${content} edited`,
    reduceRpaEnabled: true,
  }),
  false,
);

console.log('content-score-publish.test.mjs: ok');
