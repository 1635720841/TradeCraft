/**
 * Semrush 固定标题关键词规则单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const rulePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/semrush-title-keyword-rule.util.js')).href;
const scorePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/local-seo-score.js')).href;

const {
  analyzeSemrushTitleTargetKeywordIssues,
  SEMRUSH_TITLE_TARGET_KEYWORD_RULE_ZH,
  countTargetKeywordInTitle,
} = await import(rulePath);
const { scoreLocalSeo } = await import(scorePath);

describe('semrush title target keyword fixed rule', () => {
  it('exports Semrush sidebar wording', () => {
    assert.match(SEMRUSH_TITLE_TARGET_KEYWORD_RULE_ZH, /至少使用一个目标关键词/);
    assert.match(SEMRUSH_TITLE_TARGET_KEYWORD_RULE_ZH, /请勿超过一次/);
  });

  it('passes when one target keyword appears once in title', () => {
    const issues = analyzeSemrushTitleTargetKeywordIssues(
      'Peak Shaving Energy Storage Strategy Guide',
      ['peak shaving energy storage'],
    );
    assert.equal(issues.length, 0);
  });

  it('fails when no target keyword is in title', () => {
    const issues = analyzeSemrushTitleTargetKeywordIssues('Industrial Battery Buyer Guide', [
      'peak shaving energy storage',
    ]);
    assert.ok(issues.some((issue) => issue.code === 'no_target_keyword_in_title'));
  });

  it('fails when the same target keyword appears twice in title', () => {
    assert.equal(
      countTargetKeywordInTitle('Peak Shaving Guide to Peak Shaving', 'peak shaving'),
      2,
    );
    const issues = analyzeSemrushTitleTargetKeywordIssues('Peak Shaving Guide to Peak Shaving', [
      'peak shaving',
    ]);
    assert.ok(issues.some((issue) => issue.code === 'target_keyword_repeated_in_title'));
  });

  it('requires at least one of multiple target keywords in title', () => {
    const issues = analyzeSemrushTitleTargetKeywordIssues('Load Shifting Strategy Guide', [
      'peak shaving',
      'load shifting',
    ]);
    assert.equal(issues.length, 0);
  });
});

describe('scoreLocalSeo title keyword rule', () => {
  it('penalizes keyword coverage when H1 omits target keyword', () => {
    const keyword = 'peak shaving energy storage';
    const good = `# Peak Shaving Energy Storage Strategy Guide\n\n${keyword} helps sites cut demand charges.\n\n## Overview\n\n## A\n\n## B\n\n## C\n\n- a\n- b`;
    const bad = `# Industrial Battery Buyer Guide\n\n${keyword} helps sites cut demand charges.\n\n## Overview\n\n## A\n\n## B\n\n## C\n\n- a\n- b`;
    const goodScore = scoreLocalSeo({ keyword, content: good, targetWordCount: 1200 });
    const badScore = scoreLocalSeo({ keyword, content: bad, targetWordCount: 1200 });
    assert.ok(badScore.breakdown.keywordCoverage < goodScore.breakdown.keywordCoverage);
    assert.ok(
      badScore.suggestions.some((item) => item.includes('标题须至少包含一个目标关键词')),
    );
  });
});
