/**
 * CTA UTM 与 Inquiry HTML 单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/cta-utm.util.js'),
).href;
const { appendUtmToUrl, buildInquiryHtmlBlock } = await import(utilPath);

describe('cta-utm.util', () => {
  it('appends utm params and keyword term', () => {
    const url = appendUtmToUrl(
      'https://example.com/contact',
      { utmSource: 'seo-factory', utmMedium: 'blog', utmCampaign: 'valves' },
      'industrial valves',
    );

    assert.match(url, /utm_source=seo-factory/);
    assert.match(url, /utm_term=industrial(\+|%20)valves/);
  });

  it('builds inquiry html block with escaped text', () => {
    const html = buildInquiryHtmlBlock('Get a quote', 'https://example.com/contact');
    assert.match(html, /Get a quote/);
    assert.match(html, /href="https:\/\/example.com\/contact"/);
  });
});
