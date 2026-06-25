/**
 * 本地 SEO 评分单元测试（动态密度、H2 模糊匹配、长句/长段阈值）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const scorePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/local-seo-score.js')).href;
const {
  scoreLocalSeo,
  buildLocalScoreGapPlan,
  headingMatchesKeyword,
  LOCAL_SEO_PASS_THRESHOLD,
  LOCAL_PARAGRAPH_MAX_WORDS,
} = await import(scorePath);

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
    assert.ok(
      !result.suggestions.some((suggestion) => suggestion.includes('单句建议 ≤22 词')),
      'two long sentences should not trigger the long-sentence penalty',
    );
  });

  it(`uses ${LOCAL_PARAGRAPH_MAX_WORDS}-word paragraph threshold`, () => {
    assert.equal(LOCAL_PARAGRAPH_MAX_WORDS, 65);
    const longPara = Array.from({ length: 14 }, () =>
      'Smart bms monitors battery cells with CAN Bus daily.',
    ).join(' ');
    const content = `# Guide\n\n## Overview\n\n${longPara}\n\n## B\n\n## C\n\n## D\n\n- a\n- b`;
    const result = scoreLocalSeo({ keyword: 'smart bms', content, targetWordCount: 1200 });
    assert.ok(result.metrics.longParagraphsOver65 >= 1);
  });
});

describe('scoreKeywordCoverage dynamic density', () => {
  it('gives long-tail full density score with a single natural occurrence', () => {
    const keyword = 'how can i get rid of blisters';
    const content = `# Foot Blisters\n\n${keyword}? Many hikers ask this after long walks.\n\n## How Can I Get Rid of Blisters\n\nClean the area and protect the skin.\n\n## Prevention\n\n## Care\n\n## FAQ\n\n- tip one\n- tip two`;
    const result = scoreLocalSeo({ keyword, content, targetWordCount: 1200 });
    assert.equal(result.breakdown.keywordCoverage, 25);
  });

  it('does not require keyword stuffing for 4+ word phrases', () => {
    const keyword = 'how can i get rid of blisters';
    const content = `# Foot Blisters\n\n${keyword} is a common question.\n\n## Prevention Tips\n\n## Care\n\n## FAQ\n\n## More\n\n- a\n- b`;
    const result = scoreLocalSeo({ keyword, content, targetWordCount: 1200 });
    assert.ok(result.breakdown.keywordCoverage >= 17, 'opening + density should score without H2 exact match');
    assert.ok(
      !result.suggestions.some((s) => s.includes('0.8%')),
      'should not suggest old fixed density band for long-tail',
    );
  });
});

describe('headingMatchesKeyword', () => {
  it('matches reordered heading with inserted prepositions', () => {
    assert.equal(
      headingMatchesKeyword('## Is There a Cure for Blistered Feet', 'cure blistered feet'),
      true,
    );
    assert.equal(
      headingMatchesKeyword('## Smart BMS Overview', 'smart bms'),
      true,
    );
    assert.equal(
      headingMatchesKeyword('## Unrelated Topic', 'cure blistered feet'),
      false,
    );
  });

  it('matches Foot Skin Blisters 9.6 H2 patterns', () => {
    assert.equal(
      headingMatchesKeyword('## How Can I Get Rid of Blisters on Feet', 'how can i get rid of blisters'),
      true,
    );
    assert.equal(
      headingMatchesKeyword('## What Does a Blood Blister Look Like', 'blood blister'),
      true,
    );
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
          longParagraphsOver65: 0,
          passiveVoiceHits: 0,
        },
      },
      LOCAL_SEO_PASS_THRESHOLD,
    );
    assert.match(plan, /Need \+1 point/);
    assert.match(plan, /\+1 point mode/);
    assert.match(plan, />22 words/);
    assert.match(plan, />65 words/);
  });
});

describe('high-score article patterns (9.5+ SWA)', () => {
  const blistersContent = `# Foot Skin Blisters: Causes, Treatment, and Prevention

Foot skin blisters are small, fluid-filled pockets that usually heal on their own.

## What Are Blisters on Feet and What Do They Mean?

Blisters on the feet are pockets of fluid under the skin.

## What Does a Blood Blister Look Like?

A blood blister looks red or purple.

## How Can I Get Rid of Blisters on Feet?

The best way to get rid of blisters on the feet is to leave them alone.

## Is There a Cure for Blistered Feet?

There is no instant cure for blistered feet.

## Prevention

- Wear well-fitting shoes
- Keep feet dry
- Change damp socks

## FAQ

See a doctor if signs of infection appear.`;

  it('scores foot skin blisters primary keyword highly without stuffing', () => {
    const result = scoreLocalSeo({
      keyword: 'foot skin blisters',
      content: blistersContent,
      targetWordCount: 1200,
    });
    assert.equal(result.breakdown.keywordCoverage, 25);
    assert.ok(result.score >= 65, `expected strong short-fixture score, got ${result.score}`);
  });

  it('scores long-tail primary keyword with question H2 pattern', () => {
    const content = blistersContent.replace(
      'Foot skin blisters are small',
      'Many readers ask how can i get rid of blisters. Foot skin blisters are small',
    );
    const result = scoreLocalSeo({
      keyword: 'how can i get rid of blisters',
      content,
      targetWordCount: 1200,
    });
    assert.equal(result.breakdown.keywordCoverage, 25);
  });
});

describe('Semrush-aligned readability cap', () => {
  it('does not give full readability when complex words remain', () => {
    const content = `# Smart BMS Guide\n\n## Overview\n\nTraceability and serviceability matter for smart bms teams.\n\n## Features\n\n- Item one\n- Item two\n\n## More\n\n## End\n\n## FAQ`;
    const result = scoreLocalSeo({ keyword: 'smart bms', content, targetWordCount: 1200 });
    assert.ok((result.metrics.semrushComplexWordHits ?? 0) > 0);
    assert.ok(result.breakdown.readability <= 16);
  });
});
