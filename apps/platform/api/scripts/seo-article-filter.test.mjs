/**
 * SERP 竞品过滤单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const filterPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/shared-core/dist/seo/seo-article-filter.js',
  ),
).href;

const {
  filterSerpOrganicForSeoArticles,
  isSeoArticleUrl,
  isUsefulSerpFallbackUrl,
} = await import(filterPath);

describe('seo-article-filter', () => {
  it('recognizes blog-style URLs', () => {
    assert.equal(isSeoArticleUrl('https://example.com/blog/industrial-valve-guide'), true);
    assert.equal(isSeoArticleUrl('https://amazon.com/dp/123'), false);
  });

  it('keeps up to limit article URLs when enough candidates exist', () => {
    const organic = Array.from({ length: 8 }, (_, i) => ({
      link: `https://example.com/blog/post-${i}-long-slug-here`,
      title: `Post ${i}`,
    }));

    const { filtered, meta } = filterSerpOrganicForSeoArticles(organic, {
      limit: 5,
      articlesOnly: true,
    });

    assert.equal(filtered.length, 5);
    assert.equal(meta.articleKept, 5);
    assert.equal(meta.backfillKept, 0);
  });

  it('keeps article candidates only when articlesOnly is true', () => {
    const organic = [
      { link: 'https://example.com/blog/industrial-valve-guide', title: 'Guide' },
      { link: 'https://supplier.com/solutions/valves', title: 'Solutions' },
      { link: 'https://amazon.com/dp/123', title: 'Amazon' },
      { link: 'https://vendor.com/products/valve', title: 'product' },
      { link: 'https://corp.com/about-us', title: 'About' },
    ];

    const { filtered, meta } = filterSerpOrganicForSeoArticles(organic, {
      limit: 5,
      articlesOnly: true,
      minArticleCandidates: 3,
    });

    assert.equal(filtered.length, 1);
    assert.equal(meta.articleKept, 1);
    assert.equal(meta.backfillKept, 0);
    assert.ok(filtered[0].link?.includes('/blog/'));
  });

  it('includes all result types when articlesOnly is false', () => {
    const organic = [
      { link: 'https://amazon.com/dp/123' },
      { link: 'https://example.com/blog/guide' },
    ];

    const { filtered, meta } = filterSerpOrganicForSeoArticles(organic, {
      limit: 5,
      articlesOnly: false,
    });

    assert.equal(filtered.length, 2);
    assert.equal(meta.articlesOnly, false);
    assert.equal(isUsefulSerpFallbackUrl('https://corp.com/about-us'), true);
  });
});
