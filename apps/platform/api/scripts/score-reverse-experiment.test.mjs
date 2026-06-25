/**
 * Semrush 评分反推实验工具单元测试。
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/utils/score-reverse-experiment.util.js',
  ),
).href;

const {
  SCORE_REVERSE_FACTOR_KEYS,
  SCORE_REVERSE_MAX_SUBMITTED_KEYWORDS,
  aggregateScoreReverseRuleEvidence,
  buildScoreReverseVariantContent,
  createStoredScoreReverseExperiment,
  toScoreReverseExperimentDto,
} = await import(utilPath);

const keyword = 'smart bms';
const content = `# Smart BMS Buyer Guide

Smart bms systems help buyers review battery status. Teams use logs to find faults. They start pilot tests before rollout.

The controller also helps service teams use clear evidence before they start field repairs.

## How Smart BMS Works

The controller checks voltage and current. It can fit several battery layouts.

## Buyer Checklist

- Confirm voltage
- Review logs`;

for (const factor of SCORE_REVERSE_FACTOR_KEYS) {
  const variant = buildScoreReverseVariantContent(content, keyword, factor);
  assert.notEqual(variant, content, `${factor} should change exactly one controlled factor`);
}

const nearLimitContent = buildScoreReverseVariantContent(content, keyword, 'title_near_limit');
const nearLimitTitle = nearLimitContent.match(/^#\s+(.+)$/m)?.[1] ?? '';
assert.ok(nearLimitTitle.length >= 50 && nearLimitTitle.length <= 60);
assert.equal(
  nearLimitContent.replace(/^#\s+.+$/m, ''),
  content.replace(/^#\s+.+$/m, ''),
  'title length experiment must not change the body',
);
const compactContent = buildScoreReverseVariantContent(content, keyword, 'title_compact');
const compactTitle = compactContent.match(/^#\s+(.+)$/m)?.[1] ?? '';
assert.ok(compactTitle.length >= 30 && compactTitle.length <= 45);
assert.equal(
  compactContent.replace(/^#\s+.+$/m, ''),
  content.replace(/^#\s+.+$/m, ''),
  'compact title experiment must not change the body',
);

const titleOnlyContent = buildScoreReverseVariantContent(content, keyword, 'primary_keyword_title_only');
const bodyOnlyContent = buildScoreReverseVariantContent(content, keyword, 'primary_keyword_body_only');
assert.match(titleOnlyContent, /^# Smart BMS Buyer Guide/m);
assert.doesNotMatch(titleOnlyContent.replace(/^#\s+.+$/m, ''), /smart bms/i);
assert.doesNotMatch(bodyOnlyContent.match(/^#\s+(.+)$/m)?.[1] ?? '', /smart bms/i);
assert.match(bodyOnlyContent, /smart bms/i);

function longestProseWordCount(markdown) {
  return markdown
    .split(/\n\n+/)
    .filter((block) => !/^(#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(block.trim()))
    .map((block) => block.trim().split(/\s+/).filter(Boolean).length)
    .reduce((max, count) => Math.max(max, count), 0);
}

function longestSentenceWordCount(markdown) {
  const prose = markdown
    .split(/\n\n+/)
    .find((block) => !/^(#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(block.trim())) ?? '';
  const sentences = prose.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences
    .map((sentence) => sentence.trim().split(/\s+/).filter(Boolean).length)
    .reduce((max, count) => Math.max(max, count), 0);
}

function proseBlockCount(markdown) {
  return markdown
    .split(/\n\n+/)
    .filter((block) => !/^(#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(block.trim()))
    .length;
}

const strongParagraph = buildScoreReverseVariantContent(content, keyword, 'long_paragraph_strong');
const mildParagraph = buildScoreReverseVariantContent(content, keyword, 'long_paragraph');
const strongSentence = buildScoreReverseVariantContent(content, keyword, 'long_sentence_strong');
const strongComplex = buildScoreReverseVariantContent(content, keyword, 'complex_words_strong');
const strongCasual = buildScoreReverseVariantContent(content, keyword, 'casual_tone_strong');
const strongHypeTone = buildScoreReverseVariantContent(content, keyword, 'tone_hype_strong');
const strongFormalTone = buildScoreReverseVariantContent(content, keyword, 'tone_formal_strong');
assert.equal(proseBlockCount(strongParagraph), 1);
assert.ok(longestProseWordCount(strongParagraph) > longestProseWordCount(mildParagraph));
assert.ok(longestSentenceWordCount(strongSentence) > longestSentenceWordCount(content));
assert.notEqual(strongComplex, content);
assert.match(strongCasual, /Basically,|Honestly,|Look,/);
assert.match(strongHypeTone, /Breakthrough:|Game-changing:|Must-have:/);
assert.match(strongFormalTone, /Formally stated,/);

const experiment = createStoredScoreReverseExperiment({
  name: 'Smart BMS rules',
  targetKeyword: keyword,
  baselineContent: content,
  factors: ['title_too_long'],
});
experiment.trials.baseline = [8.8, 8.9, 8.9].map((score) => ({
  score,
  nodeLabel: 'node-1',
  databaseLabel: 'US',
  checkedAt: new Date().toISOString(),
}));
experiment.trials.title_too_long = [8.4, 8.5, 8.5].map((score) => ({
  score,
  nodeLabel: 'node-1',
  databaseLabel: 'US',
  checkedAt: new Date().toISOString(),
}));

const dto = toScoreReverseExperimentDto(experiment);
assert.equal(dto.variants[0].medianScore, 8.9);
assert.equal(dto.variants[1].medianScore, 8.5);
assert.equal(dto.variants[1].deltaFromBaseline, -0.4);
assert.equal(dto.variants[1].confidence, 'medium');
assert.equal(dto.variants[1].pairedSampleCount, 3);
assert.equal(dto.variants[1].pairedDeltaMedian, -0.4);
assert.equal(dto.baselineDriftDetected, false);

experiment.aiAnalysis = {
  summary: 'Title length may affect the score.',
  findings: [],
  limitations: [],
  nextActions: [],
  promptVersion: 'score_reverse_analysis_v1',
  generatedAt: new Date().toISOString(),
  basedOnUpdatedAt: experiment.updatedAt,
};
assert.equal(toScoreReverseExperimentDto(experiment).aiAnalysis.stale, false);
experiment.updatedAt = new Date(Date.parse(experiment.updatedAt) + 1_000).toISOString();
assert.equal(toScoreReverseExperimentDto(experiment).aiAnalysis.stale, true);

const manyKeywordsExperiment = createStoredScoreReverseExperiment({
  name: 'Keyword limit',
  targetKeyword: keyword,
  submittedKeywords: Array.from({ length: 40 }, (_, index) => `keyword-${index}`),
  baselineContent: content,
});
assert.equal(manyKeywordsExperiment.submittedKeywords.length, SCORE_REVERSE_MAX_SUBMITTED_KEYWORDS);
assert.equal(manyKeywordsExperiment.submittedKeywords[0], keyword);

const replicatedExperiments = Array.from({ length: 10 }, (_, articleIndex) => {
  const row = createStoredScoreReverseExperiment({
    name: `Title rule ${articleIndex}`,
    targetKeyword: keyword,
    baselineContent: `${content}\n\nArticle cohort ${articleIndex}.`,
    factors: ['title_too_long'],
  });
  const nodeLabel = articleIndex % 2 === 0 ? 'node-1' : 'node-2';
  row.trials.baseline = [8.8, 8.9, 8.8].map((score, index) => ({
    score,
    round: index + 1,
    nodeLabel,
    databaseLabel: 'US',
    checkedAt: new Date().toISOString(),
  }));
  row.trials.title_too_long = [8.2, 8.3, 8.2].map((score, index) => ({
    score,
    round: index + 1,
    nodeLabel,
    databaseLabel: 'US',
    checkedAt: new Date().toISOString(),
  }));
  return row;
});
const titleEvidence = aggregateScoreReverseRuleEvidence(replicatedExperiments)
  .find((item) => item.factorKey === 'title_too_long');
assert.ok(titleEvidence);
assert.equal(titleEvidence.articleCount, 10);
assert.equal(titleEvidence.nodeCount, 2);
assert.equal(titleEvidence.medianDelta, -0.6);
assert.equal(titleEvidence.directionConsistency, 1);
assert.equal(titleEvidence.status, 'validated');
assert.equal(titleEvidence.confidence, 'high');

const invalidContextExperiment = createStoredScoreReverseExperiment({
  name: 'Missing context',
  targetKeyword: keyword,
  baselineContent: `${content}\n\nMissing context cohort.`,
  factors: ['title_too_long'],
});
invalidContextExperiment.trials.baseline = [8.8, 8.8, 8.8].map((score) => ({
  score,
  nodeLabel: 'node-1',
  checkedAt: new Date().toISOString(),
}));
invalidContextExperiment.trials.title_too_long = [8.2, 8.2, 8.2].map((score) => ({
  score,
  nodeLabel: 'node-1',
  checkedAt: new Date().toISOString(),
}));
const invalidEvidence = aggregateScoreReverseRuleEvidence([invalidContextExperiment])
  .find((item) => item.factorKey === 'title_too_long');
assert.equal(invalidEvidence?.eligibleExperimentCount, 0);
assert.equal(invalidEvidence?.excludedExperimentCount, 1);
assert.equal(invalidEvidence?.status, 'candidate');

console.log('score-reverse-experiment.test.mjs: ok');
