/**
 * 搜索意图 Prompt 分支单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/search-intent.js'),
).href;
const {
  getSearchIntentGuidelines,
  normalizeKeywordIntent,
  searchIntentPromptLabel,
} = await import(utilPath);

describe('normalizeKeywordIntent', () => {
  it('defaults invalid values to INFORMATIONAL', () => {
    assert.equal(normalizeKeywordIntent(null), 'INFORMATIONAL');
    assert.equal(normalizeKeywordIntent('commercial'), 'COMMERCIAL');
    assert.equal(normalizeKeywordIntent('unknown'), 'INFORMATIONAL');
  });
});

describe('searchIntentPromptLabel', () => {
  it('lowercases intent for prompt templates', () => {
    assert.equal(searchIntentPromptLabel('TRANSACTIONAL'), 'transactional');
  });
});

describe('getSearchIntentGuidelines', () => {
  it('returns distinct guidance per intent', () => {
    const commercial = getSearchIntentGuidelines('COMMERCIAL');
    const informational = getSearchIntentGuidelines('INFORMATIONAL');
    assert.match(commercial, /comparison/i);
    assert.match(informational, /Informational intent/i);
    assert.notEqual(commercial, informational);
  });
});
