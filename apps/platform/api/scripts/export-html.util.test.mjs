/**
 * 导出 HTML 拼装单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/export/export-html.util.js'),
).href;
const { buildExportHtmlDocument, buildExportHtmlUrl } = await import(utilPath);

describe('buildExportHtmlDocument', () => {
  it('embeds title, meta description and json-ld', () => {
    const html = buildExportHtmlDocument({
      title: 'Test Article',
      metaDescription: 'A short summary',
      contentMarkdown: '# Hello\n\nParagraph **bold**.',
      jsonLd: { '@type': 'Article', headline: 'Test Article' },
    });

    assert.match(html, /<title>Test Article<\/title>/);
    assert.match(html, /name="description" content="A short summary"/);
    assert.match(html, /<script type="application\/ld\+json">/);
    assert.match(html, /<h1>Hello<\/h1>/);
    assert.match(html, /<strong>bold<\/strong>/);
  });

  it('renders markdown tables with styles', () => {
    const html = buildExportHtmlDocument({
      title: 'Table Article',
      metaDescription: 'Summary',
      contentMarkdown: '| A | B |\n| --- | --- |\n| 1 | 2 |',
      jsonLd: { '@type': 'Article', headline: 'Table Article' },
    });

    assert.match(html, /<table>/);
    assert.match(html, /<th>A<\/th>/);
    assert.match(html, /article table/);
    assert.doesNotMatch(html, /\| --- \|/);
  });
});

describe('buildExportHtmlUrl', () => {
  it('returns API relative path', () => {
    assert.equal(
      buildExportHtmlUrl('proj-1', 'job-1'),
      '/api/v1/projects/proj-1/seo-factory/article-jobs/job-1/export/html',
    );
  });
});
