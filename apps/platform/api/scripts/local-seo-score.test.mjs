/**
 * 本地 SEO 评分单元测试（长句阈值 22 词与提分计划）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const scorePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/local-seo-score.js')).href;
const { scoreLocalSeo, buildLocalScoreGapPlan, LOCAL_SEO_PASS_THRESHOLD } = await import(scorePath);

function repeatWord(n) {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

function articleWithLongSentences(count, wordsPerSentence) {
  const sentences = Array.from(
    { length: count },
    () => `${repeatWord(wordsPerSentence)} for smart bms systems.`,
  );
  return `# Smart BMS Guide\n\n## Overview\n\n${sentences.join(' ')}\n\n## Features\n\n- Item one\n- Item two\n\n## More\n\n## End\n\n## FAQ`;
}

describe('scoreLocalSeo readability threshold', () => {
  it('penalizes when more than 2 sentences exceed 22 words (not 25)', () => {
    const content = articleWithLongSentences(3, 24);
    const result = scoreLocalSeo({ keyword: 'smart bms', content, targetWordCount: 1200 });
    assert.equal(result.metrics.longSentencesOver22, 3);
    assert.ok(result.breakdown.readability < 20);
    assert.ok(
      result.suggestions.some((s) => s.includes('22')),
      'should suggest splitting sentences over 22 words',
    );
  });

  it('does not penalize when only 2 sentences exceed 22 words', () => {
    const short = 'Smart bms helps teams monitor battery health.';
    const long = articleWithLongSentences(2, 24).split('. ').slice(2, 4).join('. ');
    const content = `# Smart BMS\n\n## A\n\n${short} ${long}.\n\n## B\n\n## C\n\n## D\n\n- a\n- b`;
    const result = scoreLocalSeo({ keyword: 'smart bms', content, targetWordCount: 1200 });
    assert.ok(result.metrics.longSentencesOver22 <= 2);
    assert.equal(result.breakdown.readability, 20);
  });
});

describe('buildLocalScoreGapPlan', () => {
  it('includes +1 point mode when score is 94/95', () => {
    const plan = buildLocalScoreGapPlan(
      {
        score: 94,
        breakdown: {
          keywordCoverage: 25,
          serpTermAlignment: 25,
          structure: 20,
          readability: 14,
          contentDepth: 20,
        },
        suggestions: [],
        recommendedKeywords: [],
        metrics: {
          wordCount: 1200,
          keywordDensity: 1.2,
          matchedSerpTerms: 10,
          totalSerpTerms: 10,
          h2Count: 5,
          longSentencesOver22: 4,
          longParagraphsOver80: 0,
          passiveVoiceHits: 0,
        },
      },
      LOCAL_SEO_PASS_THRESHOLD,
    );
    assert.match(plan, /Need \+1 point/);
    assert.match(plan, /\+1 point mode/);
    assert.match(plan, />22 words/);
  });
});
