/**
 * parse-page-limit.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parsePageLimit } = require(resolve(apiRoot, 'dist/core/utils/parse-page-limit.util.js'));

describe('parsePageLimit', () => {
  it('returns defaults for invalid input', () => {
    assert.deepEqual(parsePageLimit('abc', 'xyz'), { page: 1, limit: 20 });
  });

  it('clamps limit to 100', () => {
    assert.deepEqual(parsePageLimit('2', '500'), { page: 2, limit: 100 });
  });

  it('respects custom defaults', () => {
    assert.deepEqual(parsePageLimit(undefined, undefined, { page: 1, limit: 50 }), {
      page: 1,
      limit: 50,
    });
  });
});
