/**
 * 打印 Semrush 优化轮实际填入 Prompt 的 recommendedKeywords / suggestions 段。
 * 用法: node apps/platform/api/scripts/print-semrush-optimize-prompt.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedRoot = resolve(apiRoot, '../../../packages/shared-core');

const semrushOptimizePath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/semrush-optimize.util.js'),
).href;
const manifestPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/keyword-coverage-manifest.util.js'),
).href;
const { buildSemrushRewriteSuggestions } = await import(semrushOptimizePath);
const {
  resolveKeywordCoverageManifest,
  mergeKeywordsForWritingFromManifest,
} = await import(manifestPath);

const templatePath = resolve(apiRoot, 'prompts/seo_optimize_semrush_v1.md');
const template = readFileSync(templatePath, 'utf8');

// 截图侧栏推荐词（绿=已覆盖，灰=缺失）
const allRecommended = [
  'individual cells',
  'long term',
  'charging and discharging',
  'centralized bms',
  'real time',
  'battery management systems bms',
  'battery cells',
  'cost effectiveness',
  'state of charge soc',
  'safe operating',
  'state of health soh',
  'operating conditions',
  'battery system',
  'reduce cost',
  'modular bms',
  'key takeaways',
  'bms designs',
  'communication protocols',
  'electric vehicles evs',
  'lithium ion batteries',
];

const missingRecommended = [
  'real time',
  'battery management systems bms',
  'battery cells',
  'cost effectiveness',
  'state of charge soc',
  'safe operating',
  'state of health soh',
  'operating conditions',
  'battery system',
  'reduce cost',
  'modular bms',
  'key takeaways',
  'bms designs',
  'communication protocols',
  'electric vehicles evs',
  'lithium ion batteries',
];

const targetKeyword = 'distributed bms vs centralized bms';
const sampleContent = `# Distributed BMS vs Centralized BMS

Individual cells need monitoring. Long term reliability depends on charging and discharging patterns.
Centralized BMS simplifies wiring for some pack layouts.
`;

const semrushResult = {
  overall: 8.2,
  skipped: false,
  suggestions: [],
  suggestionDetails: {},
  semrushRecommendedKeywords: allRecommended,
  semrushMissingRecommendedKeywords: missingRecommended,
  semrushTargetKeywords: [targetKeyword],
  semrushMissingTargetKeywords: [],
  semrushCompetitorWordCount: 1800,
  semrushCurrentWordCount: 1200,
  semrushReadabilityScore: 52,
};

const manifest = resolveKeywordCoverageManifest({
  content: sampleContent,
  targetKeyword,
  semrushActive: true,
  semrushResult,
  localMissingKeywords: [],
  briefEntities: [],
});

const keywordsForAi = mergeKeywordsForWritingFromManifest({
  manifest,
  briefData: {},
  localMissingKeywords: [],
  targetKeyword,
  extraPhrases: [targetKeyword],
});

const suggestions = buildSemrushRewriteSuggestions(semrushResult, sampleContent);

const keywordBlock =
  keywordsForAi.length > 0
    ? keywordsForAi.map((term) => `- ${term}`).join('\n')
    : '- (no keywords — fallback placeholder)';

const suggestionBlock =
  suggestions.length > 0
    ? suggestions.map((line) => `- ${line}`).join('\n')
    : '- (no suggestions)';

function fillTemplate(tpl, vars) {
  let out = tpl;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

const filled = fillTemplate(template, {
  keyword: targetKeyword,
  outputLanguage: 'English',
  brandVoice: 'Professional B2B',
  searchIntent: 'informational',
  targetWordCount: '1500',
  semrushCurrentWordCount: '1200',
  semrushCompetitorWordCount: '1800',
  semrushLocalExpandWordTarget: '1890',
  semrushReadabilityScore: '52/100',
  semrushReadabilityTarget: '50 (±8)',
  semrushWordCountCap: '2160',
  briefSummary: '(sample brief)',
  recommendedKeywords: keywordBlock,
  suggestions: suggestionBlock,
  content: sampleContent.trim(),
  localScore: '72',
  localScoreBreakdown: '(sample)',
  readabilityPriorityBlock: '',
  optimizeHistoryContext: '(first round)',
});

console.log('========== DIAGNOSTICS ==========');
console.log('manifest.totalCount:', manifest.totalCount);
console.log('manifest.missing.length:', manifest.missing.length);
console.log('manifest.missing:', manifest.missing.join(' | '));
console.log('keywordsForAi.length:', keywordsForAi.length);
console.log('keywordsForAi:', keywordsForAi.join(' | '));
console.log('suggestions.length:', suggestions.length);
console.log('first suggestion (keyword weaving?):', suggestions[0]?.slice(0, 200));
console.log('');

console.log('========== {{recommendedKeywords}} SLOT ==========');
console.log(keywordBlock);
console.log('');

console.log('========== {{suggestions}} SLOT (first 8 lines) ==========');
console.log(suggestions.slice(0, 8).map((l) => `- ${l}`).join('\n'));
console.log(`... (${suggestions.length} total, cap=28)`);
console.log('');

console.log('========== FULL PROMPT (truncated middle) ==========');
const lines = filled.split('\n');
const inputsEnd = lines.findIndex((l) => l.startsWith('## Priority When Rules Conflict'));
console.log(lines.slice(0, inputsEnd > 0 ? inputsEnd : 35).join('\n'));
