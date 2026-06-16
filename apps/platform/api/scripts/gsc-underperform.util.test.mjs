/**
 * gsc-underperform.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/gsc/gsc-underperform.util.js'),
).href;
const { isGscPageUnderperforming, pickUnderperformingJobs } = await import(utilPath);

describe('gsc-underperform.util', () => {
  it('flags zero-click pages with enough impressions', () => {
    assert.equal(
      isGscPageUnderperforming({
        impressions: 80,
        clicks: 0,
        ctr: 0,
        position: 12,
      }),
      true,
    );
  });

  it('ignores low-impression pages', () => {
    assert.equal(
      isGscPageUnderperforming({
        impressions: 10,
        clicks: 0,
        ctr: 0,
        position: 30,
      }),
      false,
    );
  });

  it('picks matched underperforming jobs sorted by impressions', () => {
    const rows = pickUnderperformingJobs([
      {
        page: 'https://example.com/a',
        impressions: 120,
        clicks: 0,
        ctr: 0,
        position: 18,
        matchedJobId: 'job-a',
        matchedKeyword: 'valve guide',
      },
      {
        page: 'https://example.com/b',
        impressions: 200,
        clicks: 1,
        ctr: 0.005,
        position: 25,
        matchedJobId: 'job-b',
        matchedKeyword: 'ball valve',
      },
      {
        page: 'https://example.com/c',
        impressions: 300,
        clicks: 10,
        ctr: 0.03,
        position: 5,
        matchedJobId: 'job-c',
        matchedKeyword: 'good page',
      },
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].jobId, 'job-b');
    assert.equal(rows[1].jobId, 'job-a');
  });
});
