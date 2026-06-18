/**
 * Semrush 优化建议合并单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/semrush-optimize.util.js'),
).href;

const {
  buildSemrushRewriteSuggestions,
  buildFallbackSemrushSuggestions,
  buildSemrushOptimizeContext,
  resolveSemrushBoostWordTarget,
} = await import(utilPath);

const longPara = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');

describe('buildSemrushRewriteSuggestions', () => {
  it('injects long-paragraph fixes when content has >80-word paragraphs', () => {
    const content = `# Title\n\n${longPara}\n\nShort tail.`;
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 8.9,
        suggestions: [],
        suggestionDetails: { tone: ['重写非常随意的句子。'] },
      },
      content,
    );
    assert.ok(lines.some((l) => l.includes('可读性·必做') && l.includes('拆分超长段')));
    assert.ok(lines.some((l) => l.includes('Semrush·必做') || l.includes('Semrush')));
  });

  it('marks DOM casual sentence quotes as mandatory tone fixes', () => {
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 8.8,
        suggestions: [],
        suggestionDetails: {
          tone: ['Test alarms, shutdown logic.', '重写非常随意的句子。'],
        },
      },
      'Short body.',
    );
    assert.ok(lines.some((l) => l.includes('语气·必做') && l.includes('Test alarms')));
  });

  it('requires contextual weaving when SWA keywords are missing', () => {
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 8,
        suggestions: [],
        semrushMissingTargetKeywords: ['cell balancing'],
        semrushMissingRecommendedKeywords: ['thermal runaway', 'battery capacity'],
      },
      'Body.',
    );
    assert.ok(lines.some((l) => l.includes('SEO·语境融合·必做') && l.includes('cell balancing')));
    assert.ok(lines.some((l) => l.includes('H2 或 H3 的问句') || l.includes('H2/H3')));
    assert.ok(
      lines
        .filter((l) => !l.includes('禁止'))
        .every((l) => !/For procurement teams, relevant search terms include/i.test(l)),
      'must not inject B2B filler sentence',
    );
  });
  it('suggests precise FAQ word gap when below competitor benchmark', () => {
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 8.5,
        suggestions: [],
        semrushCompetitorWordCount: 1115,
        semrushCurrentWordCount: 1007,
      },
      'Short body.',
    );
    assert.ok(lines.some((l) => l.includes('缺 108 词')));
    assert.ok(lines.some((l) => l.includes('FAQ')));
  });
});

describe('buildFallbackSemrushSuggestions', () => {
  it('returns structure hints when sidebar is empty', () => {
    const lines = buildFallbackSemrushSuggestions(
      { overall: 8.4, suggestions: [], suggestionDetails: {} },
      'Word one. Word two.',
    );
    assert.ok(lines.length > 0);
    assert.ok(lines.some((l) => l.includes('Markdown') || l.includes('列表')));
  });
});

describe('buildSemrushOptimizeContext', () => {
  it('enables readability priority when below 9.0', () => {
    const ctx = buildSemrushOptimizeContext(
      { overall: 8.9, suggestions: [], suggestionDetails: { seo: ['添加推荐关键词: x'] } },
      'Body.',
    );
    assert.equal(ctx.readabilityPriority, true);
    assert.equal(ctx.pointsToGo, 0.1);
    assert.ok(ctx.scoreGapPlan.includes('8.9'));
  });
});

describe('resolveSemrushBoostWordTarget', () => {
  it('prefers competitor benchmark over brief target', () => {
    assert.equal(resolveSemrushBoostWordTarget(1600, 2000), 1600);
    assert.equal(resolveSemrushBoostWordTarget(undefined, 2000), 2000);
  });
});
