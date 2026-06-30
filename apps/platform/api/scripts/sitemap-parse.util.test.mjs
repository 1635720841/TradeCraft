/**
 * sitemap-parse.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/site/sitemap-parse.util.js'),
).href;
const {
  parseSitemapLastmod,
  parseSitemapPriority,
  parseSitemapUrlEntries,
  extractChildSitemapLocs,
} = await import(utilPath);

describe('sitemap-parse.util', () => {
  it('parseSitemapUrlEntries reads loc, lastmod and priority', () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/products/a/</loc>
    <lastmod>2026-06-30T16:03:59+00:00</lastmod>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://example.com/about/</loc>
    <changefreq>weekly</changefreq>
  </url>
</urlset>`;

    const entries = parseSitemapUrlEntries(xml);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].url, 'https://example.com/products/a/');
    assert.equal(entries[0].priority, 0.9);
    assert.ok(entries[0].lastmod instanceof Date);
    assert.equal(entries[1].priority, null);
    assert.equal(entries[1].lastmod, null);
  });

  it('parseSitemapUrlEntries falls back to loc-only xml', () => {
    const xml = `<urlset>
      <loc>https://example.com/page-1/</loc>
      <loc>https://example.com/sitemap-products.xml</loc>
    </urlset>`;
    const entries = parseSitemapUrlEntries(xml);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].url, 'https://example.com/page-1/');
  });

  it('parseSitemapPriority rejects invalid values', () => {
    assert.equal(parseSitemapPriority('1.5'), null);
    assert.equal(parseSitemapPriority('abc'), null);
    assert.equal(parseSitemapPriority('0.65'), 0.65);
  });

  it('parseSitemapLastmod accepts date-only values', () => {
    const date = parseSitemapLastmod('2026-06-30');
    assert.ok(date instanceof Date);
  });

  it('extractChildSitemapLocs finds nested sitemap files', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://example.com/sitemap-products.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
    </sitemapindex>`;
    assert.deepEqual(extractChildSitemapLocs(xml), [
      'https://example.com/sitemap-products.xml',
      'https://example.com/sitemap-pages.xml',
    ]);
  });
});
