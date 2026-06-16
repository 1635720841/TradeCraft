/**
 * gsc-oauth.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/gsc/gsc-oauth.util.js'),
).href;
const { matchGscPropertyUrl, normalizeDomain, normalizePageUrlForMatch, pageUrlsMatchForGsc } =
  await import(utilPath);

describe('gsc-oauth.util', () => {
  it('normalizeDomain strips protocol and www', () => {
    assert.equal(normalizeDomain('https://www.Example.com/'), 'example.com');
    assert.equal(normalizeDomain('sc-domain:Example.com'), 'example.com');
  });

  it('matchGscPropertyUrl prefers sc-domain', () => {
    const url = matchGscPropertyUrl('example.com', [
      'https://example.com/',
      'sc-domain:example.com',
    ]);
    assert.equal(url, 'sc-domain:example.com');
  });

  it('matchGscPropertyUrl matches https property', () => {
    const url = matchGscPropertyUrl('www.example.com', ['https://www.example.com/']);
    assert.equal(url, 'https://www.example.com/');
  });

  it('pageUrlsMatchForGsc matches GSC page to CMS post URL', () => {
    assert.equal(
      normalizePageUrlForMatch('https://www.example.com/blog/valve-guide/'),
      'example.com/blog/valve-guide',
    );
    assert.equal(
      pageUrlsMatchForGsc(
        'https://example.com/blog/valve-guide',
        'https://www.example.com/blog/valve-guide/',
      ),
      true,
    );
    assert.equal(
      pageUrlsMatchForGsc('https://example.com/other', 'https://example.com/blog/valve-guide'),
      false,
    );
  });
});
