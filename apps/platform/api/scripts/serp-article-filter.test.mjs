import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterUsableCompetitorSamples,
  filterSerpOrganicForSeoArticles,
  isStandardSeoArticleCandidate,
} from '../../../../packages/shared-core/dist/index.js';

test('failed competitor scrapes never become analysis samples', () => {
  const items = [
    {
      title: 'Valid article',
      link: 'https://example.com/blog/valid',
      scraped: { wordCount: 900, headings: ['Guide'], excerpt: 'body', scrapedAt: 'now' },
    },
    {
      title: 'Forbidden article',
      link: 'https://example.com/blog/forbidden',
      scraped: {
        wordCount: 0,
        headings: [],
        excerpt: '',
        scrapedAt: 'now',
        error: 'HTTP 403',
      },
    },
    {
      title: 'Aborted article',
      link: 'https://example.com/blog/aborted',
      scraped: {
        wordCount: 0,
        headings: [],
        excerpt: '',
        scrapedAt: 'now',
        error: 'This operation was aborted',
      },
    },
  ];

  assert.deepEqual(filterUsableCompetitorSamples(items).map((item) => item.title), [
    'Valid article',
  ]);
});

test('strict article filtering rejects forums and never backfills company pages', () => {
  const organic = [
    {
      position: 1,
      title: 'How do I to chose discharge current? | DIY Solar Power Forum',
      link: 'https://diysolarforum.com/threads/how-do-i-to-chose-discharge-current.1234/',
    },
    {
      position: 2,
      title: 'Battery management services',
      link: 'https://example.com/services/battery-management',
    },
    {
      position: 3,
      title: 'How to Choose a BMS Discharge Current',
      link: 'https://example.com/blog/how-to-choose-bms-discharge-current',
    },
  ];

  const result = filterSerpOrganicForSeoArticles(organic, {
    limit: 5,
    articlesOnly: true,
    minArticleCandidates: 3,
  });

  assert.deepEqual(result.filtered.map((item) => item.position), [3]);
  assert.equal(result.meta.articleKept, 1);
  assert.equal(result.meta.backfillKept, 0);
  assert.equal(result.meta.nonArticleExcluded, 2);
});

test('forum title suffix is rejected even when the URL looks article-like', () => {
  assert.equal(
    isStandardSeoArticleCandidate({
      title: 'Charge current limit - EEVblog Forums',
      link: 'https://example.com/posts/charge-current-limit',
    }),
    false,
  );
});

test('relaxed filtering remains an explicit opt-in', () => {
  const organic = [
    { title: 'Forum result', link: 'https://example.com/threads/question' },
    { title: 'Company page', link: 'https://example.com/services/bms' },
  ];
  const result = filterSerpOrganicForSeoArticles(organic, {
    limit: 2,
    articlesOnly: false,
  });

  assert.equal(result.filtered.length, 2);
  assert.equal(result.meta.articlesOnly, false);
});
