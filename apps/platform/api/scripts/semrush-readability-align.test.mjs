/**
 * Semrush 可读性对齐工具单元测试（复杂词、难读句、词数缺口）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const alignPath = pathToFileURL(
  resolve(sharedRoot, 'dist/seo/semrush-readability-align.util.js'),
).href;

const {
  applySemrushDefaultComplexWordFixes,
  countSemrushComplexWordHits,
  detectHardToReadSentences,
  detectSemrushComplexWordSamples,
  computeSemrushWordGap,
  injectSemrushWordCountExpansion,
  formatHardToReadSentenceAuditBlock,
  resolveSemrushArticleTitle,
  analyzeSemrushTitleIssues,
  computeSemrushTitleOverallPenalty,
  applySemrushTitlePenaltyToPrediction,
  fixSemrushArticleTitleInContent,
  resolveSemrushEffectiveCurrentWordCount,
  resolveSemrushExpandWordTarget,
  buildSemrushWordCountPlan,
} = await import(alignPath);

describe('countSemrushComplexWordHits', () => {
  it('detects traceability and overdischarge', () => {
    const text = 'Full traceability and overdischarge protection for smart BMS.';
    assert.ok(countSemrushComplexWordHits(text) >= 2);
  });

  it('applySemrushDefaultComplexWordFixes replaces known terms', () => {
    const before = 'Battery traceability and serviceability matter.';
    const after = applySemrushDefaultComplexWordFixes(before);
    assert.match(after, /clear records/i);
    assert.match(after, /ease of service/i);
    assert.equal(countSemrushComplexWordHits(after), 0);
  });
});

describe('detectHardToReadSentences', () => {
  it('flags long multi-clause sentences', () => {
    const long =
      'When the battery voltage drops below the cutoff threshold, and the BMS detects a fault condition, or the cell imbalance exceeds the configured limit, the system will disconnect the load to prevent damage.';
    const hits = detectHardToReadSentences(long);
    assert.ok(hits.length >= 1);
    assert.ok(hits[0].wordCount > 18);
  });
});

describe('formatHardToReadSentenceAuditBlock', () => {
  it('lists quoted samples when hits exceed max', () => {
    const text =
      'Procurement teams compare cycle life, warranty terms, and fault logs when they evaluate suppliers, and they also review duty cycles, or they check compatibility with existing racks.';
    const samples = detectHardToReadSentences(text);
    const block = formatHardToReadSentenceAuditBlock({ hits: 3, samples });
    assert.match(block, /SURGICAL MODE/i);
    assert.match(block, /Hard-to-read sentences: \*\*3\*\*/);
    assert.match(block, /Procurement teams compare/i);
  });

  it('returns summary only when within limit', () => {
    const block = formatHardToReadSentenceAuditBlock({ hits: 2, samples: [] });
    assert.match(block, /\*\*2\*\*/);
    assert.doesNotMatch(block, /SURGICAL MODE/i);
  });
});

describe('computeSemrushWordGap and injectSemrushWordCountExpansion', () => {
  it('computes positive gap when under competitor word count', () => {
    assert.equal(computeSemrushWordGap(1063, 1279), 216);
  });

  it('injects FAQ block when gap is large', () => {
    const content = '# Smart BMS\n\nShort body.\n\n## FAQ\n\nQ: test?\nA: yes.';
    const result = injectSemrushWordCountExpansion(content, 120, 'smart bms');
    assert.ok(result.content.length > content.length);
    assert.ok(result.injectedWords >= 80);
  });
});

describe('resolveSemrushEffectiveCurrentWordCount and buildSemrushWordCountPlan', () => {
  it('uses min of api and local when api over-reports', () => {
    const reconcile = resolveSemrushEffectiveCurrentWordCount({
      localWordCount: 953,
      apiCurrentWords: 1700,
    });
    assert.equal(reconcile.effectiveCurrentWords, 953);
    assert.equal(reconcile.reconciled, true);
  });

  it('builds expand target above competitor benchmark', () => {
    const content = '# Test\n\n' + 'word '.repeat(950);
    const plan = buildSemrushWordCountPlan({
      content,
      competitorWordCount: 1700,
      apiReportedWords: 1700,
    });
    assert.equal(plan.effectiveCurrentWords, 952);
    assert.equal(plan.swaGap, 748);
    assert.ok(plan.localExpandTarget > 1700);
    assert.ok(plan.localExpandGap > plan.swaGap);
  });

  it('resolveSemrushExpandWordTarget adds +5% buffer above benchmark', () => {
    assert.equal(resolveSemrushExpandWordTarget(1700), 1785);
  });
});

describe('detectSemrushComplexWordSamples', () => {
  it('returns term and suggestion pairs', () => {
    const samples = detectSemrushComplexWordSamples('We leverage optimization for compatibility.');
    assert.ok(samples.length >= 2);
    assert.ok(samples.some((s) => s.term.toLowerCase() === 'leverage'));
  });
});

describe('Semrush title penalty', () => {
  it('prefers H1 over draft.title for Semrush alignment', () => {
    const content = '# This Is A Very Long BMS Insulation Monitoring Device Title That Exceeds Limits\n\nBody.';
    const resolved = resolveSemrushArticleTitle({
      content,
      targetKeyword: 'bms',
      articleTitle: 'Short meta title',
    });
    assert.match(resolved, /Very Long BMS/);
    assert.ok(analyzeSemrushTitleIssues(resolved).some((i) => i.code === 'too_long'));
  });

  it('lowers calibrated prediction when title is too long', () => {
    const longTitle =
      'BMS Insulation Monitoring Devices for Battery Management Systems and Fleet Operations Guide';
    const penalty = computeSemrushTitleOverallPenalty(longTitle);
    assert.ok(penalty >= 0.35);
    const adjusted = applySemrushTitlePenaltyToPrediction(8.55, longTitle);
    assert.ok(Math.abs(adjusted - (8.55 - penalty)) < 0.01);
  });

  it('fixSemrushArticleTitleInContent shortens overlong H1', () => {
    const content =
      '# This Is A Very Long BMS Insulation Monitoring Device Title That Exceeds Limits\n\nBody.';
    const fixed = fixSemrushArticleTitleInContent(content, 'bms insulation');
    const h1 = fixed.match(/^#\s+(.+)$/m)?.[1] ?? '';
    assert.ok(h1.length <= 60);
    assert.ok(analyzeSemrushTitleIssues(h1).every((i) => i.code !== 'too_long'));
  });
});

describe('buildSemrushWordCountPlan', () => {
  it('trims when local markdown exceeds competitor even if SWA API counts fewer words', () => {
    const plan = buildSemrushWordCountPlan({
      content: `${'word '.repeat(1368)}tail`,
      competitorWordCount: 1082,
      apiReportedWords: 1167,
    });
    assert.equal(plan.localWordCount, 1369);
    assert.equal(plan.effectiveCurrentWords, 1167);
    assert.equal(plan.wordCountTrimPriority, true);
  });
});
