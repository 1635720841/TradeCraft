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
const {
  countMarkdownImages,
  countEffectiveMarkdownImages,
  extractMarkdownImageRecords,
  isPlaceholderImageUrl,
  reconcileArticleImagesFromContent,
  stripPlaceholderMarkdownImages,
} = await import(utilPath);

describe('countMarkdownImages', () => {
  it('counts markdown image syntax', () => {
    const content = 'Intro\n\n![alt one](https://a.com/1.jpg)\n\n## Section\n\n![alt two](https://a.com/2.jpg)';
    assert.equal(countMarkdownImages(content), 2);
  });

  it('returns zero when no images', () => {
    assert.equal(countMarkdownImages('# Title only'), 0);
  });
});

describe('placeholder image urls', () => {
  it('detects example.com draft placeholders', () => {
    assert.equal(
      isPlaceholderImageUrl('https://example.com/images/fpv-battery-workbench.jpg'),
      true,
    );
    assert.equal(isPlaceholderImageUrl('IMAGE_PLACEHOLDER'), true);
  });

  it('does not treat media library urls as placeholders', () => {
    const assetId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    assert.equal(
      isPlaceholderImageUrl(`/api/v1/projects/p1/media/${assetId}/file?exp=1&sig=x`),
      false,
    );
  });

  it('strips placeholder markdown but keeps real images', () => {
    const content =
      'Intro\n\n![fake](https://example.com/images/a.jpg)\n\n![real](/api/v1/projects/p1/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/file)';
    const stripped = stripPlaceholderMarkdownImages(content);
    assert.equal(countMarkdownImages(stripped), 1);
    assert.equal(countEffectiveMarkdownImages(content), 1);
  });

  it('counts only effective images toward SWA minimum', () => {
    const content =
      '![a](https://example.com/a.jpg)\n\n![b](https://example.com/b.jpg)';
    assert.equal(countMarkdownImages(content), 2);
    assert.equal(countEffectiveMarkdownImages(content), 0);
  });
});

describe('reconcileArticleImagesFromContent', () => {
  it('falls back to markdown when metadata is empty', () => {
    const content = '![a](https://x.com/a.jpg)\n\n![b](https://x.com/b.jpg)';
    const reconciled = reconcileArticleImagesFromContent(content, []);
    assert.equal(reconciled.length, 2);
    assert.equal(reconciled[0]?.alt, 'a');
    assert.equal(reconciled[0]?.source, 'url');
  });

  it('prefers metadata for matching urls', () => {
    const content = '![a](https://x.com/a.jpg)';
    const existing = [{ alt: 'meta alt', url: 'https://x.com/a.jpg', source: 'bfl' }];
    const reconciled = reconcileArticleImagesFromContent(content, existing);
    assert.equal(reconciled[0]?.alt, 'meta alt');
    assert.equal(reconciled[0]?.source, 'bfl');
  });

  it('extracts media asset id from api url', () => {
    const assetId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const url = `/api/v1/projects/p1/media/${assetId}/file?exp=1&sig=x`;
    const records = extractMarkdownImageRecords(`![hero](${url})`);
    assert.equal(records[0]?.assetId, assetId);
    assert.equal(records[0]?.source, 'bfl');
  });
});
