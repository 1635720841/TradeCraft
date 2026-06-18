/**
 * Semrush SWA 结构化建议解析单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/providers/semrush/semrush-actionable.util.js'),
).href;

const {
  classifySemrushIssueRule,
  isEnglishSentenceQuote,
  mergeActionableIntoSuggestionDetails,
  dedupeActionableIssues,
  synthesizeActionableFromSuggestionDetails,
  extractNumberedQuotesFromSidebarText,
  parseActionableIssuesFromSidebarText,
} = await import(modPath);

describe('classifySemrushIssueRule', () => {
  it('maps passive voice and complex word labels', () => {
    assert.equal(classifySemrushIssueRule('考虑使用主动语态'), 'passive_voice');
    assert.equal(classifySemrushIssueRule('Replace overly complex words'), 'complex_word');
    assert.equal(classifySemrushIssueRule('最为随意的句子'), 'casual_sentence');
  });
});

describe('mergeActionableIntoSuggestionDetails', () => {
  it('merges quotes and terms into tone/readability buckets', () => {
    const merged = mergeActionableIntoSuggestionDetails(
      { tone: [] },
      [
        {
          category: 'tone',
          rule: 'casual_sentence',
          label: '最为随意的句子',
          quotes: ['For B2B teams, the value is clear.'],
        },
        {
          category: 'readability',
          rule: 'complex_word',
          label: '替换太过复杂的词语',
          terms: ['scalability', 'serviceability'],
        },
      ],
    );
    assert.ok(merged.tone?.includes('For B2B teams, the value is clear.'));
    assert.ok(merged.readability?.some((t) => t.includes('scalability')));
  });
});

describe('isEnglishSentenceQuote', () => {
  it('rejects rule headers', () => {
    assert.equal(isEnglishSentenceQuote('考虑使用主动语态'), false);
    assert.equal(
      isEnglishSentenceQuote('It is designed to turn raw pack data into faster service decisions.'),
      true,
    );
  });
});

describe('dedupeActionableIssues', () => {
  it('removes duplicate issues', () => {
    const issue = {
      category: 'readability',
      rule: 'passive_voice',
      label: '考虑使用主动语态',
      quotes: ['A basic protection board only cuts off power when limits are crossed.'],
    };
    const out = dedupeActionableIssues([issue, issue]);
    assert.equal(out.length, 1);
  });
});

describe('parseActionableIssuesFromSidebarText', () => {
  it('parses numbered casual sentences from SWA innerText', () => {
    const text = `语气\n最为随意的句子\n1\nFor B2B teams, the value is clear.\n2\nWarranty terms also matter.`;
    const out = parseActionableIssuesFromSidebarText(text);
    assert.equal(out.length, 1);
    assert.equal(out[0].rule, 'casual_sentence');
    assert.equal(out[0].quotes?.length, 2);
    assert.ok(out[0].quotes?.includes('For B2B teams, the value is clear.'));
  });
});

describe('synthesizeActionableFromSuggestionDetails', () => {
  it('builds rule issues from Chinese sidebar labels', () => {
    const out = synthesizeActionableFromSuggestionDetails({
      readability: ['考虑使用主动语态。', '替换太过复杂的词语。'],
      tone: ['重写非常随意的句子。'],
      seo: ['添加推荐关键词: foo'],
    });
    assert.equal(out.length, 3);
    assert.ok(out.some((i) => i.rule === 'passive_voice'));
    assert.ok(out.some((i) => i.rule === 'casual_sentence'));
  });
});
