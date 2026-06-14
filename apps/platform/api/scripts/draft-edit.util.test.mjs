/**
 * 稿件手动编辑 staleness 纯函数单元测试。
 * 用法：cd apps/platform/api && pnpm test:draft-edit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/article-job/draft-edit.util.js'),
).href;
const { computeDraftStaleness, isMajorContentChange, clearStalenessAffected } = await import(utilPath);

describe('computeDraftStaleness', () => {
  it('returns null when nothing changed', () => {
    const input = { title: 'A', metaDescription: 'B', content: 'Hello world' };
    assert.equal(computeDraftStaleness(input, input), null);
  });

  it('marks only local/ymyl/export stale for title-only change', () => {
    const before = { title: 'Old', metaDescription: 'Meta', content: 'Body text here' };
    const after = { title: 'New', metaDescription: 'Meta', content: 'Body text here' };
    const result = computeDraftStaleness(before, after);

    assert.ok(result);
    assert.equal(result.contentChanged, false);
    assert.equal(result.affected.localSeo, true);
    assert.equal(result.affected.semrush, false);
    assert.equal(result.affected.export, true);
    assert.equal(result.affected.internalLinks, false);
  });

  it('marks all downstream stale for content change', () => {
    const before = { title: 'T', content: 'Original paragraph with enough text.' };
    const after = { title: 'T', content: 'Completely different rewritten body content.' };
    const result = computeDraftStaleness(before, after);

    assert.ok(result);
    assert.equal(result.contentChanged, true);
    assert.equal(result.affected.semrush, true);
    assert.equal(result.affected.paraphrase, true);
    assert.equal(result.affected.ymyl, true);
  });

  it('flags internalLinks only on major content change', () => {
    const body = 'A'.repeat(200);
    const minor = computeDraftStaleness(
      { content: body },
      { content: `${body.slice(0, -1)}B` },
    );
    assert.ok(minor);
    assert.equal(minor.affected.internalLinks, false);

    const major = computeDraftStaleness(
      { content: body },
      { content: 'Totally new article body with different structure and words.' },
    );
    assert.ok(major);
    assert.equal(major.affected.internalLinks, true);
  });
});

describe('isMajorContentChange', () => {
  it('detects minor typo fix as non-major', () => {
    const text = 'The industrial valve supplier offers stainless steel products.';
    assert.equal(isMajorContentChange(text, text.replace('steel', 'steal')), false);
  });
});

describe('clearStalenessAffected', () => {
  it('clears selected flags and returns null when all clear', () => {
    const staleness = {
      contentChanged: true,
      titleMetaChanged: false,
      invalidatedAt: '2026-01-01T00:00:00.000Z',
      invalidatedBy: 'u1',
      affected: {
        localSeo: true,
        semrush: true,
        paraphrase: false,
        ymyl: false,
        export: true,
        internalLinks: false,
        images: false,
      },
    };

    const partial = clearStalenessAffected(staleness, ['localSeo']);
    assert.ok(partial);
    assert.equal(partial.affected.localSeo, false);
    assert.equal(partial.affected.semrush, true);

    const cleared = clearStalenessAffected(partial, ['semrush', 'export']);
    assert.equal(cleared, null);
  });
});
