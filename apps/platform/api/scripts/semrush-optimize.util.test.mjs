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
  evaluateSemrushRoundOutput,
  repairSemrushRoundOutput,
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

  it('omits generic SWA keyword reminder when all recommended terms are already present', () => {
    const content =
      'BMS battery management system explained covers state of charge, state of health, battery pack, battery cells, cell balancing, lithium battery, and power management.';
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 8.8,
        suggestions: [],
        semrushRecommendedKeywords: [
          'state of charge',
          'battery pack',
          'cell balancing',
          'view of pack',
        ],
      },
      content,
    );
    assert.ok(!lines.some((l) => l.includes('SWA 推荐词须各至少出现')));
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
    assert.ok(lines.some((l) => l.includes('短祈使句') && l.includes('Most casual sentences')));
    assert.ok(
      lines
        .filter((l) => !l.includes('禁止'))
        .every((l) => !/For procurement teams, relevant search terms include/i.test(l)),
      'must not inject B2B filler sentence',
    );
  });

  it('warns against short imperative keyword stuffing when Semrush says copy is too plain', () => {
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 7.4,
        suggestions: ['专业受众可能认为您的文本太过浅显。尝试使用更高级的词语和句子。'],
        suggestionDetails: {
          tone: ['Measure after a short rest.', 'Seat each connector fully.'],
        },
        semrushReadabilityScore: 64.9,
      },
      'Measure after a short rest. Seat each connector fully. Stop charging and discharging.',
    );
    assert.ok(lines.some((l) => l.includes('过于浅显') && l.includes('短命令句')));
    assert.ok(lines.some((l) => l.includes('Flesch 64.9') && l.includes('短祈使句')));
  });
  it('suggests precise FAQ word gap when below competitor benchmark', () => {
    const body = '# Title\n\n' + 'word '.repeat(1000);
    const lines = buildSemrushRewriteSuggestions(
      {
        overall: 8.5,
        suggestions: [],
        semrushCompetitorWordCount: 1115,
        semrushCurrentWordCount: 1007,
      },
      body,
    );
    const expandLine = lines.find((l) => l.includes('SWA 统计约') && l.includes('本地扩写至'));
    assert.ok(expandLine, `expected expand line, got: ${lines.join(' | ')}`);
    assert.match(expandLine, /缺 \d+ 词/);
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
  it('prefers local expand target over brief when content is short', () => {
    const shortBody = '# Title\n\n' + 'word '.repeat(900);
    assert.equal(resolveSemrushBoostWordTarget(1700, 1500, shortBody, 1700), 1785);
    assert.equal(resolveSemrushBoostWordTarget(undefined, 2000), 2000);
  });
});

describe('Semrush round output guard and repair', () => {
  it('flags expand rounds that shrink and miss mandatory keywords', () => {
    const before = '# Smart BMS\n\n' + 'battery '.repeat(120);
    const after = '# Smart BMS\n\nShort buyer note.';
    const guard = evaluateSemrushRoundOutput({
      beforeContent: before,
      afterContent: after,
      keywordBatch: ['energy storage system', 'fully charged'],
      wordCountExpandPriority: true,
      localExpandTarget: 220,
    });

    assert.equal(guard.accepted, false);
    assert.ok(guard.reasons.includes('shrank_body'));
    assert.ok(guard.reasons.includes('missing_round_keywords'));
    assert.deepEqual(guard.missingKeywords, ['energy storage system', 'fully charged']);
  });

  it('repairs missing round keywords before RPA recheck', () => {
    const repaired = repairSemrushRoundOutput({
      content: '# Smart BMS\n\nBuyers compare protection and monitoring.',
      targetKeyword: 'smart bms',
      keywordBatch: ['energy storage system', 'fully charged', 'battery capacity'],
      wordCountExpandPriority: false,
    });

    assert.equal(repaired.changed, true);
    assert.deepEqual(repaired.addedKeywords, [
      'energy storage system',
      'fully charged',
      'battery capacity',
    ]);
    assert.match(repaired.content, /energy storage system/);
    assert.match(repaired.content, /fully charged/);
    assert.match(repaired.content, /battery capacity/);
  });
});
