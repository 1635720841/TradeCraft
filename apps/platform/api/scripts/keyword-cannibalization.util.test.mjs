/**
 * keyword-cannibalization.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/keyword-pool/keyword-cannibalization.util.js'),
).href;
const {
  detectKeywordConflictReason,
  findKeywordConflicts,
  normalizeKeywordPhrase,
} = await import(utilPath);

describe('keyword-cannibalization.util', () => {
  it('normalizeKeywordPhrase lowercases and collapses spaces', () => {
    assert.equal(normalizeKeywordPhrase('  Ball   Valve '), 'ball valve');
  });

  it('detects exact and substring conflicts', () => {
    assert.equal(
      detectKeywordConflictReason('industrial ball valve', 'Industrial Ball Valve'),
      'exact',
    );
    assert.equal(
      detectKeywordConflictReason('ball valve supplier', 'ball valve supplier china'),
      'substring',
    );
  });

  it('findKeywordConflicts returns ranked conflicts', () => {
    const conflicts = findKeywordConflicts('ball valve supplier', [
      { jobId: '1', keyword: 'ball valve supplier', status: 'QUEUED' },
      { jobId: '2', keyword: 'industrial valve guide', status: 'DRAFTING' },
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].jobId, '1');
    assert.equal(conflicts[0].reason, 'exact');
  });
});
