/**
 * Semrush recommendations API 解析单元测试（纯函数，无需 Playwright）。
 * 用法：cd apps/platform/api && pnpm test:parser
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parserPath = pathToFileURL(
  resolve(
    apiRoot,
    'dist/project-types/seo-factory/providers/semrush/semrush-recommendations.parser.js',
  ),
).href;
const {
  parseOverallScore,
  parseSemrushRecommendationsPayload,
  pickBestRecommendationsCapture,
  isSemrushRecommendationsPayload,
} = await import(parserPath);

describe('parseOverallScore', () => {
  it('returns undefined when data_ready is false', () => {
    assert.equal(parseOverallScore({ data_ready: false, score: 8.5 }), undefined);
  });

  it('returns undefined when score is missing', () => {
    assert.equal(parseOverallScore({ data_ready: true }), undefined);
  });

  it('scales 0–1 fraction to 0–10', () => {
    assert.equal(parseOverallScore({ data_ready: true, score: 0.85 }), 8.5);
    assert.equal(parseOverallScore({ data_ready: true, score: 0.95 }), 9.5);
  });

  it('accepts direct 0–10 scores below suspicious perfect threshold', () => {
    assert.equal(parseOverallScore({ data_ready: true, score: 8.3 }), 8.3);
    assert.equal(parseOverallScore({ data_ready: true, score: 9.5 }), 9.5);
  });

  it('rejects suspicious perfect scores (placeholder before sidebar stabilizes)', () => {
    assert.equal(parseOverallScore({ data_ready: true, score: 1.0 }), undefined);
    assert.equal(parseOverallScore({ data_ready: true, score: 0.99 }), undefined);
    assert.equal(parseOverallScore({ data_ready: true, score: 10 }), undefined);
    assert.equal(parseOverallScore({ data_ready: true, score: 9.8 }), undefined);
    assert.equal(parseOverallScore({ data_ready: true, score: 100 }), undefined);
    assert.equal(parseOverallScore({ data_ready: true, score: 96 }), undefined);
  });

  it('rejects high fraction with weak score_quality', () => {
    assert.equal(
      parseOverallScore({ data_ready: true, score: 0.99, score_quality: 'medium' }),
      undefined,
    );
    assert.equal(
      parseOverallScore({ data_ready: true, score: 0.99, score_quality: '一般' }),
      undefined,
    );
  });

  it('scales 0–100 to 0–10', () => {
    assert.equal(parseOverallScore({ data_ready: true, score: 83 }), 8.3);
    assert.equal(parseOverallScore({ data_ready: true, score: 85 }), 8.5);
  });
});

describe('parseSemrushRecommendationsPayload', () => {
  it('extracts keywords and synthesizes tips when data_ready', () => {
    const parsed = parseSemrushRecommendationsPayload({
      data_ready: true,
      score: 0.72,
      score_quality: 'good',
      original_length: 1400,
      length: 1500,
      recommended_keywords: [{ keyword: 'industrial valve' }],
      keywords: [{ keyword: 'valve supplier' }],
    });

    assert.equal(parsed.overall, 7.2);
    assert.deepEqual(parsed.recommendedKeywords, ['industrial valve']);
    assert.deepEqual(parsed.targetKeywords, ['valve supplier']);
    assert.equal(parsed.currentWordCount, 1400);
    assert.equal(parsed.competitorWordCount, 1500);
    assert.ok(Array.isArray(parsed.details.seo));
    assert.ok(parsed.details.seo.some((tip) => tip.includes('industrial valve')));
  });

  it('returns partial data when data_ready is false but keywords exist', () => {
    const parsed = parseSemrushRecommendationsPayload({
      data_ready: false,
      recommended_keywords: [{ keyword: 'seo tool' }],
    });

    assert.equal(parsed.overall, undefined);
    assert.deepEqual(parsed.recommendedKeywords, ['seo tool']);
    assert.ok(parsed.details.seo?.some((tip) => tip.includes('seo tool')));
  });
});

describe('pickBestRecommendationsCapture', () => {
  it('prefers the last data_ready capture', () => {
    const captured = [
      {
        url: 'https://example.com/recommendations/a',
        body: { data_ready: false, recommended_keywords: [{ keyword: 'draft' }] },
      },
      {
        url: 'https://example.com/recommendations/b',
        body: { data_ready: true, score: 0.81, recommended_keywords: [{ keyword: 'final' }] },
      },
    ];

    const best = pickBestRecommendationsCapture(captured);
    assert.equal(best?.overall, 8.1);
    assert.deepEqual(best?.recommendedKeywords, ['final']);
  });

  it('falls back to last usable capture when none are data_ready', () => {
    const captured = [
      {
        url: 'https://example.com/recommendations/a',
        body: { data_ready: false, recommended_keywords: [{ keyword: 'only' }] },
      },
    ];

    const best = pickBestRecommendationsCapture(captured);
    assert.deepEqual(best?.recommendedKeywords, ['only']);
    assert.equal(best?.overall, undefined);
  });

  it('ignores non-recommendations URLs', () => {
    const best = pickBestRecommendationsCapture([
      {
        url: 'https://example.com/last_status/x',
        body: { data_ready: true, score: 9.0 },
      },
    ]);
    assert.equal(best, null);
  });
});

describe('isSemrushRecommendationsPayload', () => {
  it('detects recommendations API bodies', () => {
    assert.equal(isSemrushRecommendationsPayload({ data_ready: true }), true);
    assert.equal(isSemrushRecommendationsPayload({ score: 8 }), true);
    assert.equal(isSemrushRecommendationsPayload(null), false);
    assert.equal(isSemrushRecommendationsPayload({ foo: 'bar' }), false);
  });
});
