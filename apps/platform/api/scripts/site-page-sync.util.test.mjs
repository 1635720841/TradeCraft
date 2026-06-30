/**
 * site-page-sync.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/linking/site-page-sync.util.js'),
).href;
const { resolveSitePageBusinessValue } = await import(utilPath);

describe('site-page-sync.util', () => {
  it('uses page type base when sitemap priority is missing', () => {
    assert.equal(resolveSitePageBusinessValue('PRODUCT', null), 0.85);
    assert.equal(resolveSitePageBusinessValue('PAGE', null), 0.65);
  });

  it('takes max of type base and sitemap priority', () => {
    assert.equal(resolveSitePageBusinessValue('PAGE', 0.9), 0.9);
    assert.equal(resolveSitePageBusinessValue('PRODUCT', 0.5), 0.85);
    assert.equal(resolveSitePageBusinessValue('PAGE', 0.7), 0.7);
  });
});
