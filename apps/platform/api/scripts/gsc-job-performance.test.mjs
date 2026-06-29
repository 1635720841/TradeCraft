/**
 * GSC 页面 URL 匹配单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { pageUrlsMatchForGsc } = require(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/gsc/gsc-oauth.util.js'),
);

describe('gsc page url match', () => {
  it('matches published url with gsc page path', () => {
    assert.equal(
      pageUrlsMatchForGsc(
        'https://example.com/blog/industrial-valve',
        'https://www.example.com/blog/industrial-valve/',
      ),
      true,
    );
  });

  it('returns false for unrelated urls', () => {
    assert.equal(
      pageUrlsMatchForGsc('https://example.com/other', 'https://example.com/blog/post'),
      false,
    );
  });
});
