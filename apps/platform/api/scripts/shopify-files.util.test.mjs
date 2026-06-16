/**
 * Shopify Files HTML 图片工具单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/export/shopify-files.util.js'),
).href;
const {
  buildShopifyUploadFilename,
  decodeHtmlAttr,
  extractHtmlImageSrcs,
  isShopifyHostedImageUrl,
  shouldRemapImageForShopify,
} = await import(utilPath);

describe('extractHtmlImageSrcs', () => {
  it('collects unique img src values', () => {
    const html =
      '<p><img alt="A" src="/api/v1/projects/p/jobs/j/draft/images/a.png?exp=1&amp;sig=x">' +
      '<img alt="B" src="https://cdn.example.com/b.jpg"></p>';
    const srcs = extractHtmlImageSrcs(html);
    assert.equal(srcs.length, 2);
    assert.match(srcs[0] ?? '', /draft\/images\/a\.png/);
    assert.equal(srcs[1], 'https://cdn.example.com/b.jpg');
  });
});

describe('shouldRemapImageForShopify', () => {
  it('skips Shopify CDN and shop domain URLs', () => {
    assert.equal(
      shouldRemapImageForShopify('https://cdn.shopify.com/s/files/1/1/a.jpg', 'demo.myshopify.com'),
      false,
    );
    assert.equal(
      shouldRemapImageForShopify('https://demo.myshopify.com/files/a.jpg', 'demo.myshopify.com'),
      false,
    );
  });

  it('remaps platform draft API and external URLs', () => {
    assert.equal(
      shouldRemapImageForShopify('/api/v1/projects/p/jobs/j/draft/images/a.png', 'demo.myshopify.com'),
      true,
    );
    assert.equal(
      shouldRemapImageForShopify('https://cdn.example.com/a.jpg', 'demo.myshopify.com'),
      true,
    );
    assert.equal(shouldRemapImageForShopify('data:image/png;base64,abc', 'demo.myshopify.com'), false);
  });
});

describe('decodeHtmlAttr', () => {
  it('restores ampersand in signed query strings', () => {
    assert.equal(decodeHtmlAttr('/img?exp=1&amp;sig=abc'), '/img?exp=1&sig=abc');
  });
});

describe('buildShopifyUploadFilename', () => {
  it('builds stable seo-article prefix filenames', () => {
    const name = buildShopifyUploadFilename(0, 'https://cdn.example.com/cover-photo.jpg', '.jpg');
    assert.match(name, /^seo-article-01-cover-photo\.jpg$/);
  });
});

describe('isShopifyHostedImageUrl', () => {
  it('detects cdn.shopify.com hosts', () => {
    assert.equal(isShopifyHostedImageUrl('https://cdn.shopify.com/s/files/a.png', 'demo.myshopify.com'), true);
  });
});
