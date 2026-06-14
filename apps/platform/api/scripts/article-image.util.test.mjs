/**
 * 正文 Markdown 图片计数单元测试。
 * 用法：cd apps/platform/api && pnpm test:images
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/illustration/article-image.util.js'),
).href;
const { countMarkdownImages } = await import(utilPath);

describe('countMarkdownImages', () => {
  it('counts markdown image syntax', () => {
    const content = 'Intro\n\n![alt one](https://a.com/1.jpg)\n\n## Section\n\n![alt two](https://a.com/2.jpg)';
    assert.equal(countMarkdownImages(content), 2);
  });

  it('returns zero when no images', () => {
    assert.equal(countMarkdownImages('# Title only'), 0);
  });
});
