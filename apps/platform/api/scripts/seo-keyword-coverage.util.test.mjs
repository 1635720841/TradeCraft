/**
 * SEO 关键词覆盖清单（评分源无关）单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const modPath = pathToFileURL(
  resolve(root, 'packages/shared-core/dist/seo/seo-keyword-coverage.util.js'),
).href;

const {
  isExtractedKeywordNoise,
  buildKeywordCoverageManifest,
  refreshKeywordCoverageManifest,
  shouldRunKeywordCoveragePass,
  pickKeywordCoverageBatch,
  prioritizeMissingKeywords,
  mergeKeywordsForWriting,
} = await import(modPath);

const EMS_BODY = `# Energy Management System Architecture Guide

EMS reduces costs when it tracks peak demand and historical data.
`;

describe('isExtractedKeywordNoise', () => {
  it('flags pronoun sentence fragments', () => {
    assert.equal(isExtractedKeywordNoise('it turns raw'), true);
    assert.equal(isExtractedKeywordNoise('it also fits'), true);
  });

  it('keeps multi-word entity phrases', () => {
    assert.equal(isExtractedKeywordNoise('energy storage assets'), false);
    assert.equal(isExtractedKeywordNoise('containerized data center'), false);
  });
});

describe('buildKeywordCoverageManifest', () => {
  it('tracks recommended vs missing from API-style list', () => {
    const manifest = buildKeywordCoverageManifest({
      source: 'semrush',
      recommendedPhrases: [
        { phrase: 'reduces costs', frequency: 'Very Low' },
        { phrase: 'peak demand', frequency: 'Low' },
        { phrase: 'renewable energy sources', frequency: 'High' },
      ],
      content: EMS_BODY,
    });

    assert.equal(manifest.totalCount, 3);
    assert.equal(manifest.coveredCount, 2);
    assert.ok(manifest.missing.includes('renewable energy sources'));
    assert.ok(shouldRunKeywordCoveragePass(manifest));
  });
});

describe('pickKeywordCoverageBatch', () => {
  it('prioritizes higher frequency missing keywords first', () => {
    const manifest = buildKeywordCoverageManifest({
      source: 'semrush',
      recommendedPhrases: [
        { phrase: 'reduces costs', frequency: 'Very Low' },
        { phrase: 'renewable energy sources', frequency: 'High' },
        { phrase: 'peak demand', frequency: 'Low' },
      ],
      content: 'short body without keywords',
    });

    const ordered = prioritizeMissingKeywords(manifest.missing, manifest.recommended);
    assert.equal(ordered[0], 'renewable energy sources');

    const batch = pickKeywordCoverageBatch(manifest, 0, 2);
    assert.deepEqual(batch, ['renewable energy sources', 'peak demand']);
  });
});

describe('refreshKeywordCoverageManifest', () => {
  it('updates covered state after content edit', () => {
    const manifest = buildKeywordCoverageManifest({
      source: 'semrush',
      recommendedPhrases: [{ phrase: 'carbon emissions' }],
      content: 'no match',
    });
    assert.equal(manifest.missing.length, 1);

    const refreshed = refreshKeywordCoverageManifest(
      manifest,
      'Operators track carbon emissions over long term.',
    );
    assert.equal(refreshed.missing.length, 0);
    assert.equal(refreshed.coverageRate, 1);
  });
});

describe('mergeKeywordsForWriting', () => {
  it('puts missing keywords before already-covered when semrush manifest present', () => {
    const manifest = buildKeywordCoverageManifest({
      source: 'semrush',
      recommendedPhrases: [
        { phrase: 'reduces costs', frequency: 'Very Low' },
        { phrase: 'peak demand', frequency: 'Low' },
      ],
      content: 'EMS reduces costs during daily operations.',
    });
    const merged = mergeKeywordsForWriting({
      manifest,
      targetKeyword: 'energy management system',
    });
    assert.equal(merged[0], 'peak demand');
    assert.ok(merged.includes('reduces costs'));
  });

  it('falls back to local missing when no manifest', () => {
    const merged = mergeKeywordsForWriting({
      targetKeyword: 'smart bms',
      localMissing: ['cell balancing', 'thermal runaway'],
    });
    assert.deepEqual(merged, ['cell balancing', 'thermal runaway']);
  });
});

