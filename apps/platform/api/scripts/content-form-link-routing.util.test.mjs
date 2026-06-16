/**
 * 内容形态内链路由单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(
    apiRoot,
    'dist/project-types/seo-factory/constants/content-form-link-routing.util.js',
  ),
).href;
const { resolvePreferredPageTypes, filterPagesByPreferredTypes } = await import(utilPath);

describe('content-form-link-routing', () => {
  it('prefers product pages for product-enhanced content', () => {
    const types = resolvePreferredPageTypes('INFORMATIONAL', 'PRODUCT_ENHANCED');
    assert.deepEqual(types, ['PRODUCT', 'SERVICE', 'SOLUTION']);
  });

  it('filters pages but keeps all when no preferred match', () => {
    const pages = [
      { pageType: 'BLOG', url: '/a' },
      { pageType: 'PAGE', url: '/b' },
    ];
    const filtered = filterPagesByPreferredTypes(pages, ['PRODUCT']);
    assert.equal(filtered.length, 2);
  });
});
