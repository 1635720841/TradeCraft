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
  pickSemrushRecommendationsApiPayload,
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
    assert.equal(enriched.keywordCoverage?.source, 'semrush');
    assert.equal(enriched.keywordCoverage?.totalCount, 3);
  });

  it('uses API recommended_keywords as manifest source', () => {
    const enriched = enrichSemrushKeywordCoverage(
      { overall: 8.5, suggestions: [] },
      'Guide about energy management system.',
      {
        apiPayload: {
          data_ready: true,
          keywords: [{ keyword: 'energy storage assets' }, { keyword: 'it turns raw' }],
          recommended_keywords: [
            { keyword: 'reduces costs', frequency: 'Very Low' },
            { keyword: 'peak demand', frequency: 'Low' },
            { keyword: 'energy management system', frequency: 'Medium' },
          ],
        },
      },
    );

    assert.equal(enriched.keywordCoverage?.totalCount, 3);
    assert.equal(enriched.keywordCoverage?.coveredCount, 1);
    assert.ok(enriched.semrushMissingRecommendedKeywords?.includes('reduces costs'));
    assert.ok(enriched.semrushMissingRecommendedKeywords?.includes('peak demand'));
  });

  it('merges submitted SWA goal keywords into coverage when API list is empty', () => {
    const enriched = enrichSemrushKeywordCoverage(
      {
        overall: 8.7,
        suggestions: [],
        semrushRecommendedKeywords: [],
        semrushMissingRecommendedKeywords: [],
      },
      'Guide about battery pack basics only.',
      {
        submittedKeywords: [
          'bms battery management system explained',
          'cell balancing',
          'state of charge',
        ],
      },
    );

    assert.ok(enriched.semrushMissingRecommendedKeywords?.includes('cell balancing'));
    assert.ok(enriched.semrushMissingRecommendedKeywords?.includes('state of charge'));
    assert.equal(enriched.keywordCoverage?.totalCount, 3);
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

describe('resolveAllSemrushMissingKeywordsForRound', () => {
  it('returns all missing recommended terms without batch cap', async () => {
    const { resolveAllSemrushMissingKeywordsForRound } = await import(modPath);
    const semrushResult = {
      overall: 8.7,
      suggestions: [],
      semrushRecommendedKeywords: [
        'peak demand charges',
        'energy management system',
        'reduces costs',
        'demand response',
        'battery storage',
        'grid services',
        'load shifting',
        'tariff optimization',
        'virtual power plant',
        'ancillary services',
      ],
      semrushMissingRecommendedKeywords: [
        'peak demand charges',
        'reduces costs',
        'demand response',
      ],
      keywordCoverage: {
        source: 'semrush',
        recommended: [
          { phrase: 'peak demand charges', covered: false, role: 'recommended' },
          { phrase: 'energy management system', covered: true, role: 'recommended' },
          { phrase: 'reduces costs', covered: false, role: 'recommended' },
          { phrase: 'demand response', covered: false, role: 'recommended' },
          { phrase: 'battery storage', covered: false, role: 'recommended' },
          { phrase: 'grid services', covered: false, role: 'recommended' },
          { phrase: 'load shifting', covered: false, role: 'recommended' },
          { phrase: 'tariff optimization', covered: false, role: 'recommended' },
          { phrase: 'virtual power plant', covered: false, role: 'recommended' },
          { phrase: 'ancillary services', covered: false, role: 'recommended' },
        ],
        missing: ['peak demand charges', 'reduces costs', 'demand response'],
        coveredCount: 1,
        totalCount: 10,
        coverageRate: 0.1,
      },
    };
    const content = 'Guide about energy management system for fleets.';
    const missing = resolveAllSemrushMissingKeywordsForRound({
      content,
      semrushResult,
      manifest: semrushResult.keywordCoverage,
    });
    assert.equal(missing.length, 9);
    assert.ok(missing.includes('peak demand charges'));
    assert.ok(missing.includes('virtual power plant'));
    assert.ok(!missing.includes('energy management system'));
  });

  it('includes strictly missing submitted SWA goal keywords', async () => {
    const { resolveAllSemrushMissingKeywordsForRound } = await import(modPath);
    const missing = resolveAllSemrushMissingKeywordsForRound({
      content: 'BMS overview with battery pack only.',
      semrushResult: {
        overall: 8.7,
        suggestions: [],
        keywordCoverage: {
          source: 'semrush',
          recommended: [
            { phrase: 'battery pack', covered: true, role: 'recommended' },
            { phrase: 'cell balancing', covered: false, role: 'recommended' },
          ],
          missing: [],
          coveredCount: 1,
          totalCount: 2,
          coverageRate: 0.5,
        },
      },
      manifest: {
        source: 'semrush',
        recommended: [{ phrase: 'battery pack', covered: true, role: 'recommended' }],
        missing: [],
        coveredCount: 1,
        totalCount: 1,
        coverageRate: 1,
      },
      submittedKeywords: ['cell balancing', 'state of charge'],
    });
    assert.ok(missing.includes('cell balancing'));
    assert.ok(missing.includes('state of charge'));
  });

  it('includes single-word SWA manifest missing terms', async () => {
    const { resolveAllSemrushMissingKeywordsForRound } = await import(modPath);
    const manifest = {
      source: 'semrush',
      recommended: [
        { phrase: 'known', covered: false, role: 'recommended' },
        { phrase: 'properly', covered: false, role: 'recommended' },
        { phrase: 'countless', covered: false, role: 'recommended' },
      ],
      missing: ['known', 'properly', 'countless'],
      coveredCount: 0,
      totalCount: 3,
      coverageRate: 0,
    };
    const missing = resolveAllSemrushMissingKeywordsForRound({
      content: '# BMS Guide\n\nBody without the tags.',
      semrushResult: {
        overall: 7.4,
        suggestions: [],
        keywordCoverage: manifest,
      },
      manifest,
    });
    assert.equal(missing.length, 3);
    assert.ok(missing.includes('known'));
    assert.ok(missing.includes('properly'));
    assert.ok(missing.includes('countless'));
  });

  it('filters extracted keyword noise from candidates', async () => {
    const { resolveAllSemrushMissingKeywordsForRound } = await import(modPath);
    const missing = resolveAllSemrushMissingKeywordsForRound({
      content: 'Article body.',
      semrushResult: {
        overall: 8.5,
        suggestions: [],
        semrushRecommendedKeywords: ['it turns raw', 'peak demand charges', 'as can rs'],
      },
    });
    assert.ok(missing.includes('peak demand charges'));
    assert.ok(!missing.includes('it turns raw'));
    assert.ok(!missing.includes('as can rs'));
  });

  it('filters off-topic Semrush drift terms for BMS repair intent', async () => {
    const { resolveAllSemrushMissingKeywordsForRound } = await import(modPath);
    const missing = resolveAllSemrushMissingKeywordsForRound({
      content: 'Replace BMS without damaging cells in a lithium battery pack.',
      targetKeyword: 'replace BMS without damaging cells',
      semrushResult: {
        overall: 8.4,
        suggestions: [],
        semrushRecommendedKeywords: [
          'thermal runaway',
          'energy efficiency',
          'nuclear weapons',
          'building materials',
          'united states',
          'electrical demand',
        ],
      },
    });

    assert.ok(missing.includes('thermal runaway'));
    assert.ok(missing.includes('energy efficiency'));
    assert.equal(missing.includes('nuclear weapons'), false);
    assert.equal(missing.includes('building materials'), false);
    assert.equal(missing.includes('united states'), false);
    assert.equal(missing.includes('electrical demand'), false);
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

describe('pickSemrushRecommendationsApiPayload', () => {
  it('prefers data_ready capture with the most recommended_keywords', () => {
    const payload = pickSemrushRecommendationsApiPayload([
      {
        url: 'https://sem.example.com/swa/api/recommendations/last_status/',
        body: { data_ready: true, score: 0.87 },
      },
      {
        url: 'https://sem.example.com/swa/api/recommendations/gdoc_id/smr-1/',
        body: {
          data_ready: true,
          recommended_keywords: [
            { keyword: 'lithium ion batteries' },
            { keyword: 'fire safety' },
          ],
        },
      },
      {
        url: 'https://sem.example.com/swa/api/recommendations/gdoc_id/smr-2/',
        body: {
          data_ready: true,
          recommended_keywords: Array.from({ length: 20 }, (_, i) => ({
            keyword: `recommended term ${i}`,
          })),
        },
      },
    ]);
    assert.equal(payload?.recommended_keywords?.length, 20);
  });
});
