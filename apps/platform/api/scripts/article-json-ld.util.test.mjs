/**
 * Article JSON-LD 单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/export/article-json-ld.util.js'),
).href;
const { buildArticleJsonLd, buildFaqPageJsonLd, extractFaqItemsFromBriefAndDraft, mergeJsonLdGraph } =
  await import(utilPath);

describe('buildArticleJsonLd', () => {
  it('builds schema.org Article with headline and wordCount', () => {
    const jsonLd = buildArticleJsonLd({
      title: 'Industrial Valves Guide',
      description: 'How to choose valves',
      content: 'one two three four',
      siteDomain: 'example.com',
      targetKeyword: 'industrial valves',
      publishedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(jsonLd['@type'], 'Article');
    assert.equal(jsonLd.headline, 'Industrial Valves Guide');
    assert.equal(jsonLd.wordCount, 4);
    assert.equal(jsonLd.datePublished, '2026-01-01T00:00:00.000Z');
    assert.equal(jsonLd.publisher.name, 'example.com');
  });
});

describe('FAQ JSON-LD', () => {
  it('merges FAQPage into graph when draft has FAQ answers', () => {
    const briefData = {
      outline: {
        faqCandidates: ['What is a ball valve?', 'How to choose?'],
      },
    };
    const draft = `## FAQ

### What is a ball valve?
A ball valve uses a rotating ball to control flow.

### How to choose?
Match pressure rating and material to your medium.`;

    const faqItems = extractFaqItemsFromBriefAndDraft(briefData, draft);
    const faqJsonLd = buildFaqPageJsonLd(faqItems);
    const merged = mergeJsonLdGraph(buildArticleJsonLd({
      title: 'Valves',
      content: draft,
      siteDomain: 'example.com',
      targetKeyword: 'ball valve',
    }), faqJsonLd);

    assert.ok(merged['@graph']);
    assert.equal(merged['@graph'].length, 2);
    assert.equal(merged['@graph'][1]['@type'], 'FAQPage');
  });
});
