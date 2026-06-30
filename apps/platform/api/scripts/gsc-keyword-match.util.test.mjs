/**
 * gsc-keyword-match.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/gsc/gsc-keyword-match.util.js'),
).href;
const {
  buildGscKeywordInsight,
  matchGscQueryToKeyword,
  normalizeKeywordForGscMatch,
  pickDiscoveredGscQueries,
  resolveGscKeywordInsightStatus,
} = await import(utilPath);

describe('gsc-keyword-match.util', () => {
  it('normalizeKeywordForGscMatch lowercases and collapses spaces', () => {
    assert.equal(normalizeKeywordForGscMatch('  Ball   Valve '), 'ball valve');
  });

  it('matchGscQueryToKeyword respects site scope', () => {
    const queries = [
      {
        query: 'ball valve',
        clicks: 2,
        impressions: 100,
        ctr: 0.02,
        position: 8,
        siteId: 'site-a',
      },
      {
        query: 'ball valve',
        clicks: 0,
        impressions: 50,
        ctr: 0,
        position: 15,
        siteId: 'site-b',
      },
    ];

    const matched = matchGscQueryToKeyword('Ball Valve', queries, 'site-a');
    assert.equal(matched?.siteId, 'site-a');
    assert.equal(matched?.clicks, 2);
  });

  it('resolveGscKeywordInsightStatus marks traffic for clicked queries', () => {
    assert.equal(
      resolveGscKeywordInsightStatus(
        { impressions: 80, clicks: 3, ctr: 0.04, position: 6 },
        'PENDING',
      ),
      'traffic',
    );
  });

  it('resolveGscKeywordInsightStatus marks underperform for used zero-click pages', () => {
    assert.equal(
      resolveGscKeywordInsightStatus(
        { impressions: 120, clicks: 0, ctr: 0, position: 18 },
        'USED',
      ),
      'underperform',
    );
  });

  it('pickDiscoveredGscQueries skips existing keywords', () => {
    const rows = pickDiscoveredGscQueries(
      [
        {
          query: 'new topic',
          impressions: 80,
          clicks: 1,
          ctr: 0.01,
          position: 9,
        },
        {
          query: 'existing topic',
          impressions: 200,
          clicks: 5,
          ctr: 0.02,
          position: 4,
        },
      ],
      ['Existing Topic'],
      5,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].query, 'new topic');
  });

  it('buildGscKeywordInsight includes metrics', () => {
    const insight = buildGscKeywordInsight(
      {
        query: 'pump guide',
        clicks: 0,
        impressions: 90,
        ctr: 0,
        position: 14,
        siteId: 'site-1',
        periodDays: 28,
        syncedAt: '2026-06-01T00:00:00.000Z',
      },
      'APPROVED',
    );

    assert.equal(insight.status, 'impressions');
    assert.equal(insight.impressions, 90);
    assert.equal(insight.periodDays, 28);
  });
});
