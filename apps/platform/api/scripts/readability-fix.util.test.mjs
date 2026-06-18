/**
 * 可读性确定性修复单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const fixPath = pathToFileURL(resolve(sharedRoot, 'dist/seo/readability-fix.util.js')).href;
const scorePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/local-seo-score.js')).href;

const {
  applyReadabilitySentenceFix,
  applyReadabilityParagraphFix,
  boostLocalSeoContent,
  convertInlineDashEnumerations,
  extractLongParagraphs,
  extractLongSentences,
  SEMRUSH_PARAGRAPH_MAX_WORDS,
  SEMRUSH_PARAGRAPH_MAX_SENTENCES,
  splitLongSentence,
} = await import(fixPath);
const { scoreLocalSeo } = await import(scorePath);

function repeatWord(n) {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

describe('splitLongSentence', () => {
  it('splits a 30-word sentence to parts ≤22 words', () => {
    const long = `${repeatWord(28)} for smart bms monitoring systems today.`;
    const fixed = splitLongSentence(long.replace(/\.$/, ''));
    for (const part of fixed.split(/[.!?]+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const words = trimmed.split(/\s+/).filter(Boolean).length;
      if (words >= 4) assert.ok(words <= 22, `part has ${words} words`);
    }
  });
});

describe('applyReadabilitySentenceFix', () => {
  it('reduces long sentence count in body text', () => {
    const long1 = `${repeatWord(24)} for smart bms systems.`;
    const long2 = `${repeatWord(26)} for battery management.`;
    const content = `# Smart BMS Guide\n\n## Overview\n\n${long1} ${long2}\n\n## Features\n\n- Item one\n- Item two\n\n## More\n\nShort line here.\n\n## End\n\n## FAQ`;
    const before = extractLongSentences(content);
    assert.ok(before.length >= 2);

    const fixed = applyReadabilitySentenceFix(content);
    const after = extractLongSentences(fixed);
    assert.ok(after.length < before.length);
    assert.ok(after.length <= 2);
  });
});

describe('applyReadabilityParagraphFix', () => {
  it('splits a body paragraph over 65 words', () => {
    const longPara = Array.from({ length: 16 }, () =>
      'Smart bms monitors battery cells with CAN Bus daily.',
    ).join(' ');
    const content = `# Smart BMS Guide\n\n## Overview\n\n${longPara}\n\n## Features\n\n- Item one`;
    const before = extractLongParagraphs(content);
    assert.ok(before.length >= 1);

    const fixed = applyReadabilityParagraphFix(content);
    const after = extractLongParagraphs(fixed);
    assert.ok(after.length <= 1, `expected ≤1 long paragraph, got ${after.length}`);
    for (const p of after) {
      assert.ok(p.wordCount <= 65, `chunk still ${p.wordCount} words`);
    }
  });
});

describe('convertInlineDashEnumerations', () => {
  it('converts inline dash checklist into markdown list', () => {
    const content =
      'This first step is where most selection errors begin — a practical checklist includes: - main operating voltage range and max continuous amp draw — effective state-of-charge range - charger or inverter data flow - balancing activity under charge.';
    const fixed = convertInlineDashEnumerations(content);
    assert.match(fixed, /^This first step/m);
    assert.match(fixed, /\n- main operating voltage/);
    assert.match(fixed, /\n- charger or inverter/);
    assert.doesNotMatch(fixed, /includes: - main/);
  });
});

describe('applyReadabilityParagraphFix (Semrush 60-word cap)', () => {
  it('splits paragraphs over 60 words for SWA', () => {
    const longPara = Array.from({ length: 12 }, () =>
      'Smart bms monitors battery cells with CAN Bus daily.',
    ).join(' ');
    const content = `# Guide\n\n${longPara}`;
    const fixed = applyReadabilityParagraphFix(content, {
      maxWords: SEMRUSH_PARAGRAPH_MAX_WORDS,
      maxSentences: SEMRUSH_PARAGRAPH_MAX_SENTENCES,
    });
    const after = extractLongParagraphs(fixed, SEMRUSH_PARAGRAPH_MAX_WORDS);
    assert.equal(after.length, 0, `still ${after.length} paragraphs over 60 words`);
  });

  it('splits paragraphs with more than 3 sentences', () => {
    const content =
      'One sentence here for testing. Two sentence here for testing. Three sentence here for testing. Four sentence here for testing.';
    const fixed = applyReadabilityParagraphFix(content, {
      maxWords: 80,
      maxSentences: 3,
    });
    const blocks = fixed.split(/\n\n+/).filter(Boolean);
    assert.ok(blocks.length >= 2, 'should split into multiple paragraphs');
  });
});

describe('boostLocalSeoContent (Semrush mode)', () => {
  it('uses 60-word paragraph cap and inline list conversion', () => {
    const inline =
      'Checklist includes: - sensor accuracy for voltage - charger data flow - baseline logs for service.';
    const longPara = Array.from({ length: 12 }, () =>
      'Battery management systems monitor cells with CAN Bus daily.',
    ).join(' ');
    const content = `# BMS Guide\n\n${inline}\n\n${longPara}`;
    const boosted = boostLocalSeoContent(content, {
      targetWordCount: 1200,
      maxParagraphWords: SEMRUSH_PARAGRAPH_MAX_WORDS,
      maxParagraphSentences: SEMRUSH_PARAGRAPH_MAX_SENTENCES,
      convertInlineLists: true,
    });
    assert.match(boosted, /\n- sensor accuracy/);
    const longAfter = extractLongParagraphs(boosted, SEMRUSH_PARAGRAPH_MAX_WORDS);
    assert.equal(longAfter.length, 0);
  });
});

describe('boostLocalSeoContent', () => {
  it('fixes long sentences and improves readability score', () => {
    const sentences = Array.from(
      { length: 5 },
      () => `${repeatWord(24)} for smart bms battery systems.`,
    );
    const filler = 'Additionally, it is important to note that ';
    const body = sentences.map((s) => filler + s).join(' ');
    const content = `# Smart BMS Guide\n\n## Smart BMS Overview\n\nSmart bms systems help teams monitor battery health in real time. ${body}\n\n## Features\n\n- CAN Bus support\n- RS485 integration\n\n## Installation\n\nFollow the wiring guide.\n\n## Maintenance\n\nCheck logs weekly.\n\n## FAQ\n\nCommon questions answered.`;

    const before = scoreLocalSeo({ keyword: 'smart bms', content, targetWordCount: 1200 });
    const boosted = boostLocalSeoContent(content, { targetWordCount: 1200 });
    const after = scoreLocalSeo({ keyword: 'smart bms', content: boosted, targetWordCount: 1200 });

    assert.ok(after.metrics.longSentencesOver22 <= 2, 'long sentences should be fixed');
    assert.ok(after.breakdown.readability >= before.breakdown.readability);
    assert.ok(after.score >= before.score, 'score should not regress');
  });

  it('reduces long paragraph count and lifts readability', () => {
    const makeLongPara = () =>
      Array.from({ length: 16 }, () =>
        'Smart bms monitors battery cells with CAN Bus and RS485 daily.',
      ).join(' ');
    const content = `# Smart BMS Systems Guide\n\n## Smart BMS Benefits\n\nSmart bms platforms help operators monitor battery health with smart bms dashboards daily.\n\n${makeLongPara()}\n\n${makeLongPara()}\n\n${makeLongPara()}\n\n## Smart BMS Features\n\n- CAN Bus wiring\n- RS485 protocol\n\n## Smart BMS Setup\n\nInstall per manual.\n\n## Smart BMS Maintenance\n\nInspect quarterly.`;

    const before = scoreLocalSeo({ keyword: 'smart bms', content, targetWordCount: 1200 });
    assert.ok(before.metrics.longParagraphsOver65 > 1);

    const boosted = boostLocalSeoContent(content, { targetWordCount: 1200 });
    const after = scoreLocalSeo({ keyword: 'smart bms', content: boosted, targetWordCount: 1200 });

    assert.ok(after.metrics.longParagraphsOver65 <= 1);
    assert.ok(after.breakdown.readability > before.breakdown.readability);
    assert.ok(after.score >= before.score);
  });
});
