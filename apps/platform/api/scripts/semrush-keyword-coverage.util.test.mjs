/**
 * Semrush SEO 关键词覆盖检测单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(
    apiRoot,
    'dist/project-types/seo-factory/providers/semrush/semrush-keyword-coverage.util.js',
  ),
).href;

const {
  isSemrushKeywordPresentInContent,
  findMissingSemrushKeywords,
  enrichSemrushKeywordCoverage,
  collectPresentSeoPhrases,
  buildContextualKeywordWeavingInstruction,
} = await import(modPath);

describe('isSemrushKeywordPresentInContent', () => {
  it('matches phrase case-insensitively in markdown', () => {
    const content = '# Guide\n\nUse **cell balancing** for pack health.';
    assert.equal(isSemrushKeywordPresentInContent(content, 'cell balancing'), true);
    assert.equal(isSemrushKeywordPresentInContent(content, 'battery capacity'), false);
  });

  it('accepts hyphen relaxed match', () => {
    const content = 'LiFePO4 lithium iron phosphate chemistry.';
    assert.equal(
      isSemrushKeywordPresentInContent(content, 'lithium-iron-phosphate'),
      true,
    );
  });

  it('matches long-tail in question H2 (Foot Skin Blisters 9.6 pattern)', () => {
    const content = '# Foot Skin Blisters\n\n## How Can I Get Rid of Blisters on Feet?\n\nLeave them alone.';
    assert.equal(isSemrushKeywordPresentInContent(content, 'how can i get rid of blisters'), true);
    assert.equal(isSemrushKeywordPresentInContent(content, 'cure for blistered feet'), false);
  });

  it('matches reordered cure phrase in H2', () => {
    const content = '## Is There a Cure for Blistered Feet?\n\nBlisters heal naturally.';
    assert.equal(isSemrushKeywordPresentInContent(content, 'cure for blistered feet'), true);
  });

  it('matches colloquial symptom with inflection (Magnesium 9.5 pattern)', () => {
    const content = 'A partner hearing teeth crunching at night should mention it.';
    assert.equal(isSemrushKeywordPresentInContent(content, 'teeth crunching'), true);
    assert.equal(
      isSemrushKeywordPresentInContent(content, 'grind teeth'),
      false,
    );
  });

  it('matches grind teeth via flexible inflection', () => {
    const content = 'Many people grinding their teeth during sleep may not notice.';
    assert.equal(isSemrushKeywordPresentInContent(content, 'grind teeth'), true);
  });

  it('matches state of charge soc when punctuation splits tokens', () => {
    const content = 'Track state of charge. soc before a truck roll.';
    assert.equal(isSemrushKeywordPresentInContent(content, 'state of charge soc'), true);
  });

  it('matches slash-separated chemistry phrase when slashes appear in body', () => {
    const content = 'Confirm that the unit is LiFePO4 / Li-ion/LTO Compatible before RFQ.';
    assert.equal(
      isSemrushKeywordPresentInContent(content, 'lifepo4 / li-ion/lto compatible'),
      true,
    );
  });
});

describe('findMissingSemrushKeywords', () => {
  it('returns only absent keywords', () => {
    const content = 'smart bms and cell balancing guide.';
    const missing = findMissingSemrushKeywords(content, [
      'smart bms',
      'cell balancing',
      'battery capacity',
    ]);
    assert.deepEqual(missing, ['battery capacity']);
  });
});

describe('enrichSemrushKeywordCoverage', () => {
  it('adds missing lists and keyword actionable issues', () => {
    const enriched = enrichSemrushKeywordCoverage(
      {
        overall: 8,
        suggestions: [],
        semrushTargetKeywords: ['smart bms', 'cell balancing'],
        semrushRecommendedKeywords: ['thermal runaway', 'battery capacity'],
      },
      'Article about smart bms only.',
      { submittedKeywords: ['smart bms'] },
    );

    assert.deepEqual(enriched.semrushMissingTargetKeywords, ['cell balancing']);
    assert.ok(enriched.semrushMissingRecommendedKeywords?.includes('thermal runaway'));
    assert.ok(
      enriched.actionableIssues?.some(
        (i) => i.rule === 'keyword' && i.terms?.includes('cell balancing'),
      ),
    );
    assert.ok(enriched.suggestionDetails?.seo?.some((s) => s.includes('未覆盖')));
  });
});

describe('buildContextualKeywordWeavingInstruction', () => {
  it('includes 9.5+ exemplar patterns', () => {
    const instruction = buildContextualKeywordWeavingInstruction(['how can i get rid of blisters']);
    assert.match(instruction, /Foot Skin Blisters 9\.6/);
    assert.match(instruction, /How Can I Get Rid of Blisters on Feet/);
    assert.match(instruction, /禁止.*For procurement teams/);
  });
});

describe('collectPresentSeoPhrases', () => {
  it('returns only phrases already in content', () => {
    const content = 'Guide about smart bms and cell balancing.';
    const present = collectPresentSeoPhrases(content, [
      'smart bms',
      'cell balancing',
      'battery capacity',
    ]);
    assert.deepEqual(present, ['smart bms', 'cell balancing']);
  });
});
