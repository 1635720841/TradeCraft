/**
 * seoCheckData migrate + Zod parse 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedCorePath = pathToFileURL(
  resolve(apiRoot, '../../../packages/shared-core/dist/index.js'),
).href;

const {
  migrateSeoCheckData,
  normalizeSeoCheckDataForWrite,
  parseSeoCheckData,
  safeParseSeoCheckData,
} = await import(sharedCorePath);

describe('seo-check-data migrate', () => {
  it('migrates v0 payload to _v=1', () => {
    const raw = { local: { score: 80 }, workflow: { failedStep: 'serp' } };
    const migrated = migrateSeoCheckData(raw);
    assert.equal(migrated._v, 1);
    assert.equal(migrated.local?.score, 80);
  });

  it('returns empty object with version for null input', () => {
    const migrated = migrateSeoCheckData(null);
    assert.equal(migrated._v, 1);
  });

  it('normalizeSeoCheckDataForWrite stamps _v', () => {
    const normalized = normalizeSeoCheckDataForWrite({ semrush: { overall: 72 } });
    assert.equal(normalized._v, 1);
    assert.equal(normalized.semrush?.overall, 72);
  });

  it('parseSeoCheckData accepts unknown extra keys via passthrough', () => {
    const parsed = parseSeoCheckData({ customField: 'ok', local: { score: 1 } });
    assert.equal(parsed.customField, 'ok');
    assert.equal(parsed._v, 1);
  });

  it('safeParseSeoCheckData falls back on invalid primitive', () => {
    const parsed = safeParseSeoCheckData('not-json');
    assert.equal(parsed._v, 1);
  });
});
