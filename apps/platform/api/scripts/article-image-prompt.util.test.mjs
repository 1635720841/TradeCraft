/**
 * SEO 配图 prompt 构建单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/illustration/article-image-prompt.util.js'),
).href;
const { buildArticleImagePrompt, extractFirstSectionHint } = await import(utilPath);

describe('buildArticleImagePrompt', () => {
  it('forbids text and UI in the prompt', () => {
    const prompt = buildArticleImagePrompt({
      keyword: 'battery management system',
      index: 0,
      sectionHint: 'Real-Time Monitoring',
    });
    assert.match(prompt, /no text/i);
    assert.match(prompt, /no UI screens/i);
    assert.match(prompt, /Real-Time Monitoring/);
  });
});

describe('extractFirstSectionHint', () => {
  it('reads the first H2 heading', () => {
    const hint = extractFirstSectionHint('# Title\n\n## Monitoring Basics\n\nBody');
    assert.equal(hint, 'Monitoring Basics');
  });
});
