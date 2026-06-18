/**
 * Flesch + Semrush 语气对齐单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const fleschPath = pathToFileURL(resolve(sharedRoot, 'dist/seo/flesch-readability.util.js')).href;
const tonePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/semrush-tone.util.js')).href;
const scorePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/local-seo-score.js')).href;

const { calculateFleschReadingEase, isFleschAlignedWithSemrush } = await import(fleschPath);
const { detectSemrushCasualSentences } = await import(tonePath);
const { scoreLocalSeo } = await import(scorePath);

const B2B_SNIPPET = `# Smart BMS Guide for Buyers

## What Is a Smart BMS?

A smart bms helps buyers manage battery pack risk and service speed. Teams use field support data daily.

## Features

Buyers need clear readings during setup. Passive balancing and active balancing affect service life.

## RFQ

Which app functions can installers perform? Next, size current for the real job.`;

describe('calculateFleschReadingEase', () => {
  it('returns a positive score for plain English B2B text', () => {
    const score = calculateFleschReadingEase(B2B_SNIPPET);
    assert.ok(score > 30 && score < 80, `unexpected flesch ${score}`);
  });
});

describe('detectSemrushCasualSentences', () => {
  it('flags RFQ-style casual sentences from Smart BMS pattern', () => {
    const hits = detectSemrushCasualSentences(B2B_SNIPPET);
    assert.ok(hits.length >= 1, `expected casual hits, got ${hits.length}: ${hits.map((h) => h.text).join(' | ')}`);
    assert.ok(
      hits.some((h) => /which app functions|next,\s*size current/i.test(h.text)),
      'should flag RFQ or Next casual pattern',
    );
  });
});

describe('scoreLocalSeo semrush alignment', () => {
  it('penalizes readability when Flesch drifts and casual tone is high', () => {
    const result = scoreLocalSeo({
      keyword: 'smart bms',
      content: B2B_SNIPPET,
      targetWordCount: 1200,
      competitorWordCount: 1367,
    });
    assert.ok(typeof result.metrics.fleschReadingEase === 'number');
    assert.ok((result.metrics.casualSentenceHits ?? 0) >= 1);
    assert.ok(result.breakdown.readability < 20);
    assert.ok(result.suggestions.some((s) => s.includes('随意') || s.includes('Flesch')));
  });

  it('uses competitor word count for structure gap', () => {
    const short = scoreLocalSeo({
      keyword: 'smart bms',
      content: B2B_SNIPPET,
      targetWordCount: 1500,
      competitorWordCount: 1367,
    });
    assert.ok(
      short.suggestions.some((s) => s.includes('Semrush') && s.includes('词')),
      'should flag word gap vs competitor',
    );
  });
});

describe('isFleschAlignedWithSemrush', () => {
  it('accepts scores near default target 50', () => {
    assert.equal(isFleschAlignedWithSemrush(53, 50), true);
    assert.equal(isFleschAlignedWithSemrush(35, 50), false);
  });
});
