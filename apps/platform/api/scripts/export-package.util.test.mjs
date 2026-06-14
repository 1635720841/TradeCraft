/**
 * 导出资产包 zip 拼装单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/export/export-package.util.js'),
).href;
const {
  buildMetaTxt,
  collectExportImageSources,
  replaceImageSrcInHtml,
  slugifyExportBaseName,
} = await import(utilPath);

describe('slugifyExportBaseName', () => {
  it('normalizes keyword to safe file base', () => {
    assert.equal(slugifyExportBaseName('Industrial Valve Supplier'), 'industrial-valve-supplier');
    assert.equal(slugifyExportBaseName('  '), 'article');
  });
});

describe('collectExportImageSources', () => {
  it('deduplicates articleImages and markdown images', () => {
    const items = collectExportImageSources(
      [{ alt: 'Cover', url: 'https://cdn.example.com/a.jpg', source: 'bfl' }],
      'Intro\n\n![Inline](https://cdn.example.com/a.jpg)\n\n![Other](https://cdn.example.com/b.png)',
    );

    assert.equal(items.length, 2);
    assert.equal(items[0]?.url, 'https://cdn.example.com/a.jpg');
    assert.equal(items[1]?.url, 'https://cdn.example.com/b.png');
  });
});

describe('replaceImageSrcInHtml', () => {
  it('rewrites remote image src to relative paths', () => {
    const html =
      '<img alt="Cover" src="https://cdn.example.com/a.jpg"><img alt="Other" src="https://cdn.example.com/b.png">';
    const next = replaceImageSrcInHtml(html, [
      { originalUrl: 'https://cdn.example.com/a.jpg', relativePath: 'images/01-cover.jpg', alt: 'Cover' },
      { originalUrl: 'https://cdn.example.com/b.png', relativePath: 'images/02-other.png', alt: 'Other' },
    ]);

    assert.match(next, /src="images\/01-cover\.jpg"/);
    assert.match(next, /src="images\/02-other\.png"/);
    assert.doesNotMatch(next, /cdn\.example\.com/);
  });
});

describe('buildMetaTxt', () => {
  it('includes title keyword and image count', () => {
    const text = buildMetaTxt({
      title: 'Test Article',
      targetKeyword: 'industrial valve',
      metaDescription: 'Summary',
      siteDomain: 'example.com',
      exportedAt: '2026-06-14T00:00:00.000Z',
      imageCount: 2,
    });

    assert.match(text, /Title: Test Article/);
    assert.match(text, /Keyword: industrial valve/);
    assert.match(text, /Images: 2 file\(s\) in images\//);
  });
});
