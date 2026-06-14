/**
 * Semrush Markdown→HTML 转换单元测试（图片/链接须转为真实 HTML 标签）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/providers/semrush/semrush-content.js'),
).href;
const { markdownToHtml } = await import(utilPath);

describe('markdownToHtml', () => {
  it('converts markdown images to img tags', () => {
    const html = markdownToHtml(
      '## Section\n\n![BMS monitoring](https://cdn.example.com/bms.jpg)',
    );
    assert.match(html, /<img alt="BMS monitoring" src="https:\/\/cdn\.example\.com\/bms\.jpg">/);
    assert.doesNotMatch(html, /!\[/);
  });

  it('converts markdown links to anchor tags', () => {
    const html = markdownToHtml('See [our guide](https://example.com/guide) for details.');
    assert.match(html, /<a href="https:\/\/example\.com\/guide">our guide<\/a>/);
  });

  it('keeps headings and paragraphs', () => {
    const html = markdownToHtml('# Title\n\nBody text.');
    assert.match(html, /<h1>Title<\/h1>/);
    assert.match(html, /<p>Body text\.<\/p>/);
  });
});
