/**
 * serp-research-settings 单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/constants/serp-research-settings.js',
  ),
).href;

const {
  mergeSiteSerpResearchSettings,
  parseSiteSerpResearchSettings,
  resolveSerpResearchOptions,
} = await import(utilPath);

describe('serp-research-settings', () => {
  it('parseSiteSerpResearchSettings clamps values', () => {
    const parsed = parseSiteSerpResearchSettings({
      articleLimit: 99,
      organicFetchNum: 5,
      minArticleCandidates: 0,
    });
    assert.equal(parsed?.articleLimit, 20);
    assert.equal(parsed?.organicFetchNum, 10);
    assert.equal(parsed?.minArticleCandidates, 1);
  });

  it('resolveSerpResearchOptions prefers overrides over site settings', () => {
    const resolved = resolveSerpResearchOptions(
      { serpResearch: { articleLimit: 8, articlesOnly: true, organicFetchNum: 40 } },
      { serpArticlesOnly: false, serpArticleLimit: 6 },
    );
    assert.equal(resolved.serpArticleLimit, 6);
    assert.equal(resolved.serpArticlesOnly, false);
    assert.equal(resolved.organicFetchNum, 40);
  });

  it('resolveSerpResearchOptions falls back to defaults', () => {
    const resolved = resolveSerpResearchOptions(null);
    assert.equal(resolved.serpArticleLimit, 5);
    assert.equal(resolved.serpArticlesOnly, true);
    assert.equal(resolved.organicFetchNum, 30);
    assert.equal(resolved.minArticleCandidates, 3);
    assert.equal(resolved.cacheTtlSeconds, 24 * 3600);
  });

  it('resolveSerpResearchOptions uses target market when no job override', () => {
    const resolved = resolveSerpResearchOptions(
      { serpResearch: { country: 'JP' } },
      undefined,
      { targetMarket: 'UK' },
    );
    assert.equal(resolved.serpCountry, 'GB');
  });

  it('resolveSerpResearchOptions prefers job override over target market', () => {
    const resolved = resolveSerpResearchOptions(
      null,
      { serpCountry: 'CA' },
      { targetMarket: 'US' },
    );
    assert.equal(resolved.serpCountry, 'CA');
  });

  it('resolveSerpResearchOptions respects cache disabled', () => {
    const resolved = resolveSerpResearchOptions({
      serpResearch: { cacheTtlHours: 0 },
    });
    assert.equal(resolved.cacheTtlSeconds, 0);
  });

  it('mergeSiteSerpResearchSettings patches partial fields', () => {
    const merged = mergeSiteSerpResearchSettings(
      { articleLimit: 5, articlesOnly: true },
      { organicFetchNum: 45 },
    );
    assert.equal(merged?.articleLimit, 5);
    assert.equal(merged?.organicFetchNum, 45);
  });
});
