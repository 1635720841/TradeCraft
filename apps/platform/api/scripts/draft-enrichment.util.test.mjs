/**
 * 初稿增强项 reconciler 单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/illustration/draft-enrichment.util.js'),
).href;
const { mergeDraftEnrichments } = await import(utilPath);

describe('mergeDraftEnrichments', () => {
  it('reinserts missing internal links and images', () => {
    const merged = mergeDraftEnrichments({
      content: '## Intro\n\nBody without enrichments.',
      internalLinks: [
        {
          anchorText: 'BMS guide',
          targetUrl: 'https://example.com/bms',
          pageType: 'BLOG',
          confidence: 0.8,
          matchReason: 'test',
          insertAfterHeading: 'Intro',
        },
      ],
      articleImages: [
        { alt: 'BMS photo', url: 'https://cdn.example.com/bms.jpg', source: 'bfl' },
      ],
    });

    assert.match(merged, /\[BMS guide\]\(https:\/\/example\.com\/bms\)/);
    assert.match(merged, /!\[BMS photo\]\(https:\/\/cdn\.example\.com\/bms\.jpg\)/);
  });

  it('does not duplicate existing enrichments', () => {
    const content =
      '## Intro\n\nSee [BMS guide](https://example.com/bms).\n\n![BMS photo](https://cdn.example.com/bms.jpg)';
    const merged = mergeDraftEnrichments({
      content,
      internalLinks: [
        {
          anchorText: 'BMS guide',
          targetUrl: 'https://example.com/bms',
          pageType: 'BLOG',
          confidence: 0.8,
          matchReason: 'test',
        },
      ],
      articleImages: [
        { alt: 'BMS photo', url: 'https://cdn.example.com/bms.jpg', source: 'bfl' },
      ],
    });

    assert.equal(merged, content);
  });
});
