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
const { markdownToHtml, markdownToSemrushHtml } = await import(utilPath);

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

  it('converts markdown tables to html tables', () => {
    const html = markdownToHtml(
      '| Use case | Priority |\n| --- | --- |\n| EV fleet | Fast diagnostics |',
    );
    assert.match(html, /<table>/);
    assert.match(html, /<th>Use case<\/th>/);
    assert.match(html, /<td>EV fleet<\/td>/);
    assert.doesNotMatch(html, /\| --- \|/);
  });

  it('renders inline dash pseudo lists as ul/li after structure repair', () => {
    const html = markdownToHtml(
      'Look for these features:\n\novervoltage and undervoltage protection - charge and discharge.\ncurrent limits - temperature sensing - event logging for support teams.',
    );
    assert.match(html, /<ul>/);
    assert.match(html, /<li>overvoltage and undervoltage protection<\/li>/);
    assert.match(html, /<li>charge and discharge\.<\/li>/);
    assert.match(html, /<li>current limits<\/li>/);
    assert.match(html, /<li>event logging for support teams\.<\/li>/);
  });

  it('flattens tables into paragraphs for semrush quill', () => {
    const html = markdownToSemrushHtml(
      '| Method | Strength | Main risk | Best fit |\n| --- | --- | --- | --- |\n| Fuzzy | Smooth blending | Harder validation trace | Comfort-focused programs |',
    );
    assert.doesNotMatch(html, /<table>/);
    assert.match(html, /<strong>Fuzzy<\/strong>/);
    assert.match(html, /<strong>Strength:<\/strong> Smooth blending/);
    assert.match(html, /Comfort-focused programs/);
    assert.doesNotMatch(html, /FuzzySmooth/);
  });
});
