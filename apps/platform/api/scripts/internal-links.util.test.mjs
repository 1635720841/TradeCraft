/**
 * 内链编辑同步单元测试（纯函数）。
 * 用法：cd apps/platform/api && pnpm test:linking
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/article-job/internal-links.util.js'),
).href;
const {
  applyInternalLinkEditsToContent,
  insertInternalLinkMarkdown,
  mergeInternalLinkEdits,
  removeLinkMarkdownFromContent,
  syncInternalLinksInContent,
} = await import(utilPath);

describe('syncInternalLinksInContent', () => {
  it('replaces markdown link when anchor or url changes', () => {
    const content = 'See [old anchor](https://example.com/old) for details.';
    const previous = [{ anchorText: 'old anchor', targetUrl: 'https://example.com/old' }];
    const next = [{ anchorText: 'new anchor', targetUrl: 'https://example.com/new' }];
    const updated = syncInternalLinksInContent(content, previous, next);
    assert.match(updated, /\[new anchor\]\(https:\/\/example.com\/new\)/);
    assert.doesNotMatch(updated, /old anchor/);
  });
});

describe('applyInternalLinkEditsToContent', () => {
  it('removes deleted links from markdown content', () => {
    const content = 'Intro.\n\nRelated: [keep](https://example.com/keep).\n\nRelated: [drop](https://example.com/drop).';
    const previous = [
      {
        anchorText: 'keep',
        targetUrl: 'https://example.com/keep',
        pageType: 'PAGE',
        confidence: 1,
        matchReason: 'semantic',
      },
      {
        anchorText: 'drop',
        targetUrl: 'https://example.com/drop',
        pageType: 'PAGE',
        confidence: 1,
        matchReason: 'semantic',
      },
    ];
    const result = applyInternalLinkEditsToContent(content, previous, [
      { anchorText: 'keep', targetUrl: 'https://example.com/keep' },
    ]);

    assert.equal(result.links.length, 1);
    assert.match(result.content, /\[keep\]\(https:\/\/example.com\/keep\)/);
    assert.doesNotMatch(result.content, /\[drop\]/);
  });

  it('appends newly added manual links', () => {
    const content = '## Overview\n\nBody text.';
    const previous = [];
    const result = applyInternalLinkEditsToContent(content, previous, [
      { anchorText: 'Catalog', targetUrl: 'https://example.com/catalog' },
    ]);

    assert.equal(result.links.length, 1);
    assert.equal(result.links[0]?.matchReason, 'manual_add');
    assert.match(result.content, /\[Catalog\]\(https:\/\/example.com\/catalog\)/);
  });
});

describe('removeLinkMarkdownFromContent', () => {
  it('removes parenthetical injected links', () => {
    const content = 'Our valves ( [valve guide](https://example.com/valves) ).';
    const updated = removeLinkMarkdownFromContent(
      content,
      'valve guide',
      'https://example.com/valves',
    );
    assert.doesNotMatch(updated, /valve guide/);
    assert.match(updated, /Our valves/);
  });
});

describe('insertInternalLinkMarkdown', () => {
  it('inserts under matching heading section', () => {
    const content = '## Specs\n\nDetails here.\n\n## FAQ\n\nAnswers.';
    const updated = insertInternalLinkMarkdown(
      content,
      '[datasheet](https://example.com/sheet)',
      'Specs',
    );
    assert.match(updated, /## Specs[\s\S]*\[datasheet\]\(https:\/\/example.com\/sheet\)/);
    assert.match(updated, /## FAQ/);
  });
});

describe('mergeInternalLinkEdits', () => {
  it('preserves metadata from existing links and tags new links as manual_add', () => {
    const existing = [
      {
        anchorText: 'Valve guide',
        targetUrl: 'https://example.com/valves',
        pageType: 'PRODUCT',
        confidence: 0.88,
        matchReason: 'semantic',
        insertAfterHeading: 'Overview',
      },
    ];
    const merged = mergeInternalLinkEdits(existing, [
      { anchorText: 'Valve guide', targetUrl: 'https://example.com/valves' },
      { anchorText: 'Catalog', targetUrl: 'https://example.com/catalog' },
    ]);

    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.pageType, 'PRODUCT');
    assert.equal(merged[1]?.matchReason, 'manual_add');
    assert.equal(merged[1]?.pageType, 'PAGE');
  });
});
