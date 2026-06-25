/**
 * Semrush 提交词表（正文提取）单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(
    apiRoot,
    'dist/project-types/seo-factory/providers/semrush/semrush-submitted-keywords.util.js',
  ),
).href;

const {
  buildSemrushSubmittedKeywords,
  buildSemrushCheckInputFromContent,
  filterSemrushSubmittedKeywordsInContent,
} = await import(modPath);

const SMART_BMS_SNIPPET = `<h1>Smart BMS Guide for Buyers</h1>
<p>A smart bms helps buyers manage battery pack risk, service speed, and data visibility.</p>
<h2>What Is a Smart BMS?</h2>
<p>A smart bms is a Battery Management System with sensors, software, and communications.</p>
<p>A basic BMS protects the battery pack. A smart model also speeds commissioning, diagnostics, and fleet support.</p>
<h2>Smart BMS Features That Matter in Procurement</h2>
<p>Buyers should start with the data that supports daily service. Clear readings reduce guesswork during setup, field support, and failure review.</p>
<p>Balancing affects service life, control, and cost.</p>
<p>Extending battery life depends on cell consistency. A smart controller keeps drift visible.</p>
<p>That extends battery service, protects usable capacity, and supports long term fleet planning.</p>
<p>For deeper planning, see our <a href="https://example.com/resources/battery-pack-design">battery pack design guide</a> and <a href="https://example.com/solutions/industrial-battery-systems">industrial battery systems</a>.</p>
<p>Some teams compare intelligent options from daly or dalybms, then review whether Google or Apple app support stays current.</p>`;

const LEGACY_POOL = [
  'smart bms',
  'battery management system',
  'battery pack',
  'lifepo4 / li-ion/lto compatible',
  'state of charge soc',
  'extends battery',
  'electric vehicles',
];

const GOLDEN_EXTRACTED = [
  'battery service',
  'what is a smart bms',
  'battery pack design guide',
  'battery management systems bms',
  'industrial battery systems',
  'smart model',
  'service life',
  'apple app support',
  'smart controller',
  'field support',
];

describe('buildSemrushSubmittedKeywords', () => {
  it('returns 8–12 content-aligned phrases (not the full legacy pool)', () => {
    const submitted = buildSemrushSubmittedKeywords(SMART_BMS_SNIPPET, {
      targetKeyword: 'smart bms',
      poolKeywords: LEGACY_POOL,
    });

    assert.ok(submitted.length >= 8, `expected >=8, got ${submitted.length}`);
    assert.ok(submitted.length <= 12, `expected <=12, got ${submitted.length}`);
    assert.equal(submitted.includes('lifepo4 / li-ion/lto compatible'), false);
    assert.equal(submitted.includes('extends battery'), false);
  });

  it('drops pronoun-led body n-grams like "so it can"', () => {
    const body = `# BMS Guide

A battery pack needs control so it can work safely. The pack so it can stop faults. Not only by voltage alone.`;
    const submitted = buildSemrushSubmittedKeywords(body, {
      targetKeyword: 'bms battery management system explained',
      poolKeywords: ['state of charge', 'cell balancing'],
    });

    assert.equal(submitted.includes('so it can'), false);
    assert.equal(submitted.includes('pack so it'), false);
    assert.equal(submitted.includes('it can work'), false);
    assert.equal(submitted.includes('not only by'), false);
  });

  it('prefers heading/link phrases that match the 9.1 manual extract set', () => {
    const submitted = buildSemrushSubmittedKeywords(SMART_BMS_SNIPPET, {
      targetKeyword: 'smart bms',
      poolKeywords: LEGACY_POOL,
    });

    const overlap = GOLDEN_EXTRACTED.filter((phrase) => submitted.includes(phrase));
    assert.ok(
      overlap.length >= 3,
      `expected >=3 golden phrases, got ${overlap.length}: ${overlap.join(', ')} | all=${submitted.join(', ')}`,
    );
    assert.ok(submitted.includes('what is a smart bms'));
    assert.ok(
      submitted.some(
        (phrase) =>
          phrase.includes('field support') ||
          phrase.includes('battery service') ||
          phrase.includes('smart model') ||
          phrase.includes('smart controller'),
      ),
    );
  });
});

describe('buildSemrushCheckInputFromContent', () => {
  it('keeps job targetKeyword as RPA primary and pins it first in submittedKeywords', () => {
    const input = buildSemrushCheckInputFromContent(SMART_BMS_SNIPPET, 'smart bms', LEGACY_POOL);

    assert.ok(input.submittedKeywords.length >= 8);
    assert.equal(input.keyword, 'smart bms');
    assert.equal(input.submittedKeywords[0], 'smart bms');
    assert.deepEqual(input.recommendedKeywords, input.submittedKeywords.slice(1));
    assert.equal(input.submittedKeywords.length, input.recommendedKeywords.length + 1);
  });
});

describe('filterSemrushSubmittedKeywordsInContent', () => {
  it('drops persisted SWA tags that are not present in the article body', () => {
    const filtered = filterSemrushSubmittedKeywordsInContent(SMART_BMS_SNIPPET, [
      'smart bms',
      'battery management system',
      'applications support and buying checklist',
      'bms 12 200',
    ]);

    assert.ok(filtered.includes('smart bms'));
    assert.ok(filtered.includes('battery management system'));
    assert.equal(filtered.includes('applications support and buying checklist'), false);
    assert.equal(filtered.includes('bms 12 200'), false);
  });
});
