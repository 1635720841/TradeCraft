import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/shared-core/src/seo/competitor-analysis.util.ts',
);
const { summarizeCompetitorSerp } = await import(pathToFileURL(utilPath).href);

const organic = [
  {
    position: 1,
    title: 'A',
    link: 'https://a.example',
    scraped: { wordCount: 1200, headings: ['H1', 'H2'], excerpt: 'a', scrapedAt: 't' },
  },
  {
    position: 2,
    title: 'B',
    link: 'https://b.example',
    scraped: { wordCount: 1400, headings: ['Intro'], excerpt: 'b', scrapedAt: 't' },
  },
  {
    position: 3,
    title: 'C',
    link: 'https://c.example',
    scraped: { error: 'timeout', wordCount: 0, headings: [], excerpt: '', scrapedAt: 't' },
  },
];

const summary = summarizeCompetitorSerp(organic, { targetWordCount: 1300 });
assert.equal(summary.total, 3);
assert.equal(summary.scrapedCount, 2);
assert.equal(summary.scrapeFailedCount, 1);
assert.equal(summary.medianWordCount, 1300);
assert.equal(summary.avgWordCount, 1300);
assert.ok(summary.wordCountHint?.includes('接近'));
assert.equal(summary.rows[0].headingCount, 2);
assert.deepEqual(summary.scrapeErrorSamples, ['timeout']);

const empty = summarizeCompetitorSerp([], { targetWordCount: 1500 });
assert.equal(empty.total, 0);
assert.equal(empty.medianWordCount, null);
assert.ok(empty.wordCountHint?.includes('待抓取'));

console.log('competitor-analysis.util.test.mjs: ok');
