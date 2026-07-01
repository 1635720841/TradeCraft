/**
 * 内链匹配与植入单元测试（纯函数）。
 * 用法：cd apps/platform/api && pnpm test:linking
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/linking/link-match.util.js'),
).href;
const {
  injectInternalLinks,
  scoreSectionPageMatch,
  inferPageTypeFromUrl,
  titleFromUrl,
} = await import(utilPath);

describe('scoreSectionPageMatch', () => {
  it('scores higher when section shares keywords with page', () => {
    const page = {
      url: 'https://example.com/products/industrial-valve',
      title: 'Industrial Valve Solutions',
      summary: 'High quality valves for manufacturing',
      keywords: ['industrial valve', 'manufacturing'],
      pageType: 'PRODUCT',
      businessValue: 0.9,
    };
    const high = scoreSectionPageMatch(
      'Our industrial valve systems improve manufacturing efficiency.',
      page,
    );
    const low = scoreSectionPageMatch('Weather forecast for next week.', page);
    assert.ok(high > low);
    assert.ok(high >= 0.42);
  });
});

describe('injectInternalLinks', () => {
  it('inserts markdown links into relevant sections', () => {
    const content = [
      '## Introduction',
      '',
      'Industrial valve suppliers help factories improve reliability and safety.',
      '',
      '## Weather',
      '',
      'It may rain tomorrow in the city center.',
    ].join('\n');

    const pages = [
      {
        url: 'https://acme.com/products/industrial-valve',
        title: 'Industrial Valve',
        summary: 'Valve products for factories',
        keywords: ['industrial valve', 'supplier'],
        pageType: 'PRODUCT',
        businessValue: 0.9,
      },
      {
        url: 'https://acme.com/blog/weather-tips',
        title: 'Weather Tips',
        summary: 'Daily weather advice',
        keywords: ['weather', 'rain'],
        pageType: 'BLOG',
        businessValue: 0.5,
      },
    ];

    const result = injectInternalLinks(content, pages);
    assert.match(result.content, /\[Industrial Valve\]\(https:\/\/acme\.com\/products\/industrial-valve\)/);
    assert.equal(result.links.length >= 1, true);
    assert.equal(result.links[0]?.pageType, 'PRODUCT');
  });

  it('inserts at least SWA_MIN_INTERNAL_LINKS for short articles', () => {
    const content = [
      '## Overview',
      '',
      'Industrial valve systems improve manufacturing throughput and safety for modern plants.',
      '',
      '## Selection',
      '',
      'Choose industrial valve models that match pressure ratings and material requirements.',
      '',
      '## Maintenance',
      '',
      'Regular industrial valve maintenance prevents downtime and extends service life.',
    ].join('\n');

    const pages = [
      {
        url: 'https://acme.com/products/industrial-valve',
        title: 'Industrial Valve',
        summary: 'Valve products for factories',
        keywords: ['industrial valve', 'manufacturing'],
        pageType: 'PRODUCT',
        businessValue: 0.9,
      },
      {
        url: 'https://acme.com/services/valve-installation',
        title: 'Valve Installation',
        summary: 'Professional valve installation services',
        keywords: ['industrial valve', 'installation'],
        pageType: 'SERVICE',
        businessValue: 0.85,
      },
      {
        url: 'https://acme.com/blog/valve-maintenance',
        title: 'Valve Maintenance Guide',
        summary: 'Maintenance tips for industrial valves',
        keywords: ['industrial valve', 'maintenance'],
        pageType: 'BLOG',
        businessValue: 0.7,
      },
    ];

    const result = injectInternalLinks(content, pages);
    assert.ok(result.links.length >= 2, `expected >=2 links, got ${result.links.length}`);
  });

  it('does not treat markdown images as existing internal links', () => {
    const content = [
      '## Overview',
      '',
      '![Industrial valve diagram](https://cdn.example.com/valve.png)',
      '',
      'Industrial valve suppliers help factories improve reliability and safety.',
      '',
      '## Maintenance',
      '',
      '![Maintenance checklist](https://cdn.example.com/checklist.png)',
      '',
      'Regular industrial valve maintenance prevents downtime and extends service life.',
    ].join('\n');

    const pages = [
      {
        url: 'https://acme.com/products/industrial-valve',
        title: 'Industrial Valve',
        summary: 'Valve products for factories',
        keywords: ['industrial valve', 'supplier'],
        pageType: 'PRODUCT',
        businessValue: 0.9,
      },
      {
        url: 'https://acme.com/blog/valve-maintenance',
        title: 'Valve Maintenance Guide',
        summary: 'Maintenance tips for industrial valves',
        keywords: ['industrial valve', 'maintenance'],
        pageType: 'BLOG',
        businessValue: 0.7,
      },
    ];

    const result = injectInternalLinks(content, pages);
    assert.ok(result.links.length >= 2, `expected >=2 links, got ${result.links.length}`);
  });

  it('returns original content when page library is empty', () => {
    const content = 'Short article without enough context.';
    const result = injectInternalLinks(content, []);
    assert.equal(result.content, content);
    assert.deepEqual(result.links, []);
  });
});

describe('helpers', () => {
  it('infers page type from URL path', () => {
    assert.equal(inferPageTypeFromUrl('https://x.com/products/valve'), 'PRODUCT');
    assert.equal(inferPageTypeFromUrl('https://x.com/services/install'), 'SERVICE');
    assert.equal(inferPageTypeFromUrl('https://x.com/blog/post-1'), 'BLOG');
  });

  it('builds title from URL slug', () => {
    assert.match(titleFromUrl('https://x.com/blog/industrial-valve-guide'), /Industrial Valve Guide/i);
  });
});
