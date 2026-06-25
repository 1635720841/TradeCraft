/**
 * Semrush 黑盒反推实验：生成单变量对照稿并计算重复检测差分。
 *
 * 边界：
 * - 不负责：HTTP、DB 持久化、真实 Semrush 检测
 */

import { createHash, randomUUID } from 'node:crypto';

export const SCORE_REVERSE_EXPERIMENTS_KEY = 'scoreReverseExperiments';
export const SCORE_REVERSE_MAX_EXPERIMENTS = 20;
export const SCORE_REVERSE_REPEAT_TARGET = 3;
export const SCORE_REVERSE_MAX_SUBMITTED_KEYWORDS = 30;

export const SCORE_REVERSE_FACTOR_KEYS = [
  'title_compact',
  'title_near_limit',
  'title_too_long',
  'title_missing',
  'duplicate_heading',
  'long_paragraph',
  'long_sentence',
  'complex_words',
  'casual_tone',
  'long_paragraph_strong',
  'long_sentence_strong',
  'complex_words_strong',
  'casual_tone_strong',
  'tone_hype_strong',
  'tone_formal_strong',
  'primary_keyword_missing',
  'primary_keyword_title_only',
  'primary_keyword_body_only',
] as const;

export type ScoreReverseFactorKey = (typeof SCORE_REVERSE_FACTOR_KEYS)[number];

export interface ScoreReverseTrial {
  score: number;
  round?: number;
  nodeLabel?: string;
  nodeKey?: string;
  databaseLabel?: string;
  contentHash?: string;
  keywordSetHash?: string;
  semrushReadabilityScore?: number;
  semrushCurrentWordCount?: number;
  semrushCompetitorWordCount?: number;
  suggestions?: string[];
  suggestionDetails?: Partial<Record<'readability' | 'seo' | 'tone' | 'originality', string[]>>;
  analysisSource?: 'api' | 'dom' | 'mixed';
  checkedAt: string;
}

export interface StoredScoreReverseAiAnalysis {
  summary: string;
  findings: Array<{
    factorKey: string;
    title: string;
    evidence: string;
    interpretation: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  limitations: string[];
  nextActions: Array<{
    factorKey?: string;
    title: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  promptVersion: string;
  generatedAt: string;
  basedOnUpdatedAt: string;
}

export interface StoredScoreReverseExperiment {
  id: string;
  name: string;
  targetKeyword: string;
  submittedKeywords: string[];
  baselineContent: string;
  factors: ScoreReverseFactorKey[];
  trials: Partial<Record<'baseline' | ScoreReverseFactorKey, ScoreReverseTrial[]>>;
  observations?: Partial<Record<'baseline' | ScoreReverseFactorKey, string>>;
  aiAnalysis?: StoredScoreReverseAiAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreReverseVariant {
  key: 'baseline' | ScoreReverseFactorKey;
  label: string;
  mutationSummary: string;
  content: string;
  trials: ScoreReverseTrial[];
  medianScore: number | null;
  meanScore: number | null;
  standardDeviation: number | null;
  deltaFromBaseline: number | null;
  pairedDeltaMedian: number | null;
  pairedDeltaStandardDeviation: number | null;
  pairedSampleCount: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  warnings: string[];
}

export type ScoreReverseRuleStatus = 'candidate' | 'replicated' | 'validated' | 'inconclusive';

export interface ScoreReverseRuleEvidence {
  factorKey: ScoreReverseFactorKey;
  label: string;
  experimentCount: number;
  eligibleExperimentCount: number;
  excludedExperimentCount: number;
  articleCount: number;
  nodeCount: number;
  medianDelta: number | null;
  meanDelta: number | null;
  standardDeviation: number | null;
  directionConsistency: number | null;
  confidence: 'high' | 'medium' | 'low';
  status: ScoreReverseRuleStatus;
  warnings: string[];
}

const FACTOR_META: Record<ScoreReverseFactorKey, { label: string; summary: string }> = {
  title_compact: { label: '标题精简版', summary: '仅把 H1 缩短到约 30–45 字符并保留完整主关键词' },
  title_near_limit: { label: '标题临界长度', summary: '仅把 H1 调整到接近 60 字符，正文完全不变' },
  title_too_long: { label: '标题过长', summary: '仅把 H1 扩展到超过 60 字符与 12 个词' },
  title_missing: { label: '移除标题', summary: '仅移除 H1，保留全部正文' },
  duplicate_heading: { label: '重复 H2', summary: '仅重复第一个 H2 标题' },
  long_paragraph: { label: '超长段落', summary: '仅合并相邻正文段，文字内容不变' },
  long_sentence: { label: '超长句', summary: '仅合并前三个句子，事实内容不变' },
  complex_words: { label: '复杂词', summary: '将少量简单词替换为 Semrush 常见复杂词' },
  casual_tone: { label: '随意语气', summary: '仅给首个正文句增加随意语气标记' },
  long_paragraph_strong: { label: '超长段落（强）', summary: '将全部正文段合并为单段，目标超过 65 词' },
  long_sentence_strong: { label: '超长句（强）', summary: '将前三个正文段各合并为单句，目标超过 30 词' },
  complex_words_strong: { label: '复杂词（强）', summary: '批量替换 14 组常见简单词为复杂同义词' },
  casual_tone_strong: { label: '随意语气（强）', summary: '在前三个正文段加入口语标记与缩写' },
  tone_hype_strong: { label: '营销语气（强）', summary: '在前三个正文段加入夸张营销措辞与号召表达' },
  tone_formal_strong: { label: '学术语气（强）', summary: '将前三个正文段改为正式书面语并移除口语词' },
  primary_keyword_missing: { label: '移除主关键词', summary: '将完整主关键词替换为通用指代' },
  primary_keyword_title_only: { label: '标题保留关键词', summary: '仅保留 H1 中的主关键词，正文全部替换为通用指代' },
  primary_keyword_body_only: { label: '正文保留关键词', summary: '仅从 H1 移除主关键词，正文保持不变' },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceFirstH1(content: string, replacement: string): string {
  if (/^#\s+.+$/m.test(content)) return content.replace(/^#\s+.+$/m, `# ${replacement}`);
  return `# ${replacement}\n\n${content.trim()}`;
}

function mutateTitleTooLong(content: string, keyword: string): string {
  const title = `${keyword} Complete Technical Buyer Evaluation and Implementation Planning Guide`;
  return replaceFirstH1(content, title);
}

function mutateTitleNearLimit(content: string, keyword: string): string {
  const base = keyword.trim();
  const suffixes = [
    'Guide',
    'Buyer Guide',
    'Technical Buyer Guide',
    'Selection and Buyer Guide',
    'Technical Selection and Buyer Guide',
    'Complete Technical Selection and Buyer Guide',
  ];
  const candidates = [base, ...suffixes.map((suffix) => `${base} ${suffix}`)]
    .filter((title) => title.length <= 60);
  const preferred = candidates.filter((title) => title.length >= 50);
  const pool = preferred.length ? preferred : candidates;
  const title = [...pool].sort(
    (left, right) => Math.abs(left.length - 58) - Math.abs(right.length - 58),
  )[0] ?? base;
  return replaceFirstH1(content, title);
}

function mutateTitleCompact(content: string, keyword: string): string {
  const base = keyword.trim();
  const candidates = [
    base,
    `${base} Guide`,
    `${base} Buyer Guide`,
    `${base} Technical Buyer Guide`,
    `${base} Complete Technical Buyer Guide`,
  ]
    .filter((title) => title.length <= 45);
  const title = [...candidates].sort(
    (left, right) => Math.abs(left.length - 40) - Math.abs(right.length - 40),
  )[0] ?? base;
  return replaceFirstH1(content, title);
}

function mutateTitleMissing(content: string): string {
  return content.replace(/^#\s+.+\n*/m, '').trim();
}

function mutateDuplicateHeading(content: string): string {
  const match = content.match(/^##\s+.+$/m);
  if (!match) return `${content.trim()}\n\n## Repeated Test Section\n\n## Repeated Test Section`;
  return content.replace(match[0], `${match[0]}\n\n${match[0]}`);
}

function isProseBlock(block: string): boolean {
  const trimmed = block.trim();
  return Boolean(trimmed) && !/^(#{1,6}\s+|[-*]\s+|\d+\.\s+|!\[|\|)/.test(trimmed);
}

function mutateLongParagraph(content: string): string {
  const blocks = content.split(/\n\n+/);
  let start = -1;
  let length = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    if (isProseBlock(blocks[index])) {
      if (start < 0) start = index;
      length += 1;
      continue;
    }
    if (length >= 2) break;
    start = -1;
    length = 0;
  }
  if (start < 0 || length < 2) return content;
  const mergeCount = Math.min(4, length);
  const merged = blocks.slice(start, start + mergeCount).map((block) => block.trim()).join(' ');
  blocks.splice(start, mergeCount, merged);
  return blocks.join('\n\n');
}

function mutateLongSentence(content: string): string {
  const blocks = content.split(/\n\n+/);
  const index = blocks.findIndex((block) => isProseBlock(block) && (block.match(/[.!?]+/g)?.length ?? 0) >= 3);
  if (index < 0) return content;
  const sentences = blocks[index].match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (sentences.length < 3) return content;
  const joined = sentences
    .slice(0, 3)
    .map((sentence) => sentence.replace(/[.!?]+$/, ''))
    .join(', and ');
  blocks[index] = `${joined}. ${sentences.slice(3).join(' ')}`.trim();
  return blocks.join('\n\n');
}

function mutateComplexWords(content: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\buse\b/i, 'utilize'],
    [/\bhelp\b/i, 'facilitate'],
    [/\bstart\b/i, 'commence'],
    [/\bfit\b/i, 'compatibility'],
  ];
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), content);
}

function mutateCasualTone(content: string): string {
  const blocks = content.split(/\n\n+/);
  const index = blocks.findIndex(isProseBlock);
  if (index < 0) return content;
  blocks[index] = `Basically, ${blocks[index].replace(/^./, (char) => char.toLowerCase())}`;
  return blocks.join('\n\n');
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function mergeSentencesToOne(sentences: string[]): string {
  const joined = sentences
    .map((sentence) => sentence.replace(/[.!?]+$/, '').trim())
    .filter(Boolean)
    .join(', and ');
  return joined ? `${joined}.` : sentences.join(' ');
}

function mutateLongParagraphStrong(content: string): string {
  const blocks = content.split(/\n\n+/);
  const proseIndices = blocks
    .map((block, index) => (isProseBlock(block) ? index : -1))
    .filter((index) => index >= 0);
  if (proseIndices.length < 2) return mutateLongParagraph(content);
  const merged = proseIndices.map((index) => blocks[index].trim()).join(' ');
  return blocks
    .map((block, index) => {
      if (index === proseIndices[0]) return merged;
      if (proseIndices.includes(index)) return null;
      return block;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

function mutateLongSentenceStrong(content: string): string {
  const blocks = content.split(/\n\n+/);
  let proseDone = 0;
  for (let index = 0; index < blocks.length && proseDone < 3; index += 1) {
    if (!isProseBlock(blocks[index])) continue;
    const sentences = splitSentences(blocks[index]);
    if (sentences.length < 2) continue;
    blocks[index] = mergeSentencesToOne(sentences);
    proseDone += 1;
  }
  return blocks.join('\n\n');
}

const STRONG_COMPLEX_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\buse\b/gi, 'utilize'],
  [/\bhelp\b/gi, 'facilitate'],
  [/\bstart\b/gi, 'commence'],
  [/\bfit\b/gi, 'compatibility'],
  [/\bshow\b/gi, 'demonstrate'],
  [/\bmake\b/gi, 'construct'],
  [/\bget\b/gi, 'obtain'],
  [/\bneed\b/gi, 'necessitate'],
  [/\bkeep\b/gi, 'maintain'],
  [/\bcheck\b/gi, 'verify'],
  [/\bfind\b/gi, 'identify'],
  [/\bgood\b/gi, 'advantageous'],
  [/\bfast\b/gi, 'expeditious'],
  [/\bimportant\b/gi, 'paramount'],
];

function mutateComplexWordsStrong(content: string): string {
  return STRONG_COMPLEX_WORD_REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    content,
  );
}

const CASUAL_TONE_STRONG_MARKERS = ['Basically,', 'Honestly,', 'Look,'];

function mutateCasualToneStrong(content: string): string {
  const blocks = content.split(/\n\n+/);
  let proseDone = 0;
  for (let index = 0; index < blocks.length && proseDone < 3; index += 1) {
    if (!isProseBlock(blocks[index])) continue;
    const marker = CASUAL_TONE_STRONG_MARKERS[proseDone % CASUAL_TONE_STRONG_MARKERS.length];
    blocks[index] = blocks[index]
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bwill not\b/gi, "won't")
      .replace(/\bwill\b/gi, 'gonna')
      .replace(/^/, `${marker} `);
    proseDone += 1;
  }
  return blocks.join('\n\n');
}

const TONE_HYPE_STRONG_PREFIXES = [
  'Breakthrough:',
  'Game-changing:',
  'Must-have:',
];

function mutateToneHypeStrong(content: string): string {
  const blocks = content.split(/\n\n+/);
  let proseDone = 0;
  for (let index = 0; index < blocks.length && proseDone < 3; index += 1) {
    if (!isProseBlock(blocks[index])) continue;
    const prefix = TONE_HYPE_STRONG_PREFIXES[proseDone % TONE_HYPE_STRONG_PREFIXES.length];
    blocks[index] = blocks[index]
      .replace(/\bhelps?\b/gi, 'dramatically transforms')
      .replace(/\bcan\b/gi, 'will certainly')
      .replace(/\bimportant\b/gi, 'absolutely critical')
      .replace(/\.$/, ' — act now.');
    blocks[index] = `${prefix} ${blocks[index]}`;
    proseDone += 1;
  }
  return blocks.join('\n\n');
}

function mutateToneFormalStrong(content: string): string {
  const blocks = content.split(/\n\n+/);
  let proseDone = 0;
  for (let index = 0; index < blocks.length && proseDone < 3; index += 1) {
    if (!isProseBlock(blocks[index])) continue;
    blocks[index] = blocks[index]
      .replace(/\bBasically,\s*/gi, '')
      .replace(/\bHonestly,\s*/gi, '')
      .replace(/\bLook,\s*/gi, '')
      .replace(/\bdon't\b/gi, 'do not')
      .replace(/\bcan't\b/gi, 'cannot')
      .replace(/\bgonna\b/gi, 'will')
      .replace(/\bhelp\b/gi, 'assist')
      .replace(/\bshow\b/gi, 'demonstrate');
    blocks[index] = `Formally stated, ${blocks[index].replace(/^./, (char) => char.toLowerCase())}`;
    proseDone += 1;
  }
  return blocks.join('\n\n');
}

function replacePrimaryKeyword(text: string, keyword: string, replacement: string): string {
  if (!keyword.trim()) return text;
  return text.replace(new RegExp(escapeRegExp(keyword.trim()), 'gi'), replacement);
}

function mutatePrimaryKeywordMissing(content: string, keyword: string): string {
  return replacePrimaryKeyword(content, keyword, 'the monitoring solution');
}

function mutatePrimaryKeywordTitleOnly(content: string, keyword: string): string {
  if (!keyword.trim()) return content;
  const match = content.match(/^#\s+.+$/m);
  if (!match) return mutatePrimaryKeywordMissing(content, keyword);
  const h1 = match[0];
  const body = content.slice(match.index! + h1.length);
  return `${h1}${replacePrimaryKeyword(body, keyword, 'the monitoring solution')}`;
}

function mutatePrimaryKeywordBodyOnly(content: string, keyword: string): string {
  if (!keyword.trim()) return content;
  if (!/^#\s+.+$/m.test(content)) return content;
  return content.replace(/^#\s+.+$/m, (h1Line) => {
    const title = h1Line
      .replace(/^#\s+/, '')
      .replace(new RegExp(escapeRegExp(keyword.trim()), 'gi'), '')
      .replace(/\s+/g, ' ')
      .trim();
    return `# ${title.length >= 8 ? title : 'Technical Buyer Guide'}`;
  });
}

export function buildScoreReverseVariantContent(
  content: string,
  keyword: string,
  factor: ScoreReverseFactorKey,
): string {
  switch (factor) {
    case 'title_compact': return mutateTitleCompact(content, keyword);
    case 'title_near_limit': return mutateTitleNearLimit(content, keyword);
    case 'title_too_long': return mutateTitleTooLong(content, keyword);
    case 'title_missing': return mutateTitleMissing(content);
    case 'duplicate_heading': return mutateDuplicateHeading(content);
    case 'long_paragraph': return mutateLongParagraph(content);
    case 'long_sentence': return mutateLongSentence(content);
    case 'complex_words': return mutateComplexWords(content);
    case 'casual_tone': return mutateCasualTone(content);
    case 'long_paragraph_strong': return mutateLongParagraphStrong(content);
    case 'long_sentence_strong': return mutateLongSentenceStrong(content);
    case 'complex_words_strong': return mutateComplexWordsStrong(content);
    case 'casual_tone_strong': return mutateCasualToneStrong(content);
    case 'tone_hype_strong': return mutateToneHypeStrong(content);
    case 'tone_formal_strong': return mutateToneFormalStrong(content);
    case 'primary_keyword_missing': return mutatePrimaryKeywordMissing(content, keyword);
    case 'primary_keyword_title_only': return mutatePrimaryKeywordTitleOnly(content, keyword);
    case 'primary_keyword_body_only': return mutatePrimaryKeywordBodyOnly(content, keyword);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function hashScoreReverseContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function hashScoreReverseKeywordSet(keywords: string[]): string {
  return createHash('sha256')
    .update(keywords.map((item) => item.trim().toLowerCase()).filter(Boolean).join('\n'))
    .digest('hex')
    .slice(0, 16);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : round2(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function mean(values: number[]): number | null {
  return values.length ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function standardDeviation(values: number[]): number | null {
  const average = mean(values);
  if (average === null || values.length < 2) return null;
  return round2(Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length));
}

function normalizeTrials(trials: ScoreReverseTrial[]): ScoreReverseTrial[] {
  return trials.map((trial, index) => ({ ...trial, round: trial.round ?? index + 1 }));
}

function pairedDeltas(
  baselineTrials: ScoreReverseTrial[],
  variantTrials: ScoreReverseTrial[],
): number[] {
  const baselineByRound = new Map(
    normalizeTrials(baselineTrials).map((trial) => [trial.round, trial]),
  );
  return normalizeTrials(variantTrials).flatMap((trial) => {
    const baseline = baselineByRound.get(trial.round);
    return baseline ? [round2(trial.score - baseline.score)] : [];
  });
}

function analyzeVariant(
  key: 'baseline' | ScoreReverseFactorKey,
  content: string,
  trials: ScoreReverseTrial[],
  baselineMedian: number | null,
  baselineTrials: ScoreReverseTrial[],
): ScoreReverseVariant {
  const normalizedTrials = normalizeTrials(trials);
  const scores = normalizedTrials.map((trial) => trial.score);
  const medianScore = median(scores);
  const deviation = standardDeviation(scores);
  const nodes = new Set(normalizedTrials.map((trial) => trial.nodeLabel?.trim()).filter(Boolean));
  const databases = new Set(
    normalizedTrials.map((trial) => trial.databaseLabel?.trim()).filter(Boolean),
  );
  const normalizedBaselineTrials = normalizeTrials(baselineTrials);
  const baselineNodes = new Set(
    normalizedBaselineTrials.map((trial) => trial.nodeLabel?.trim()).filter(Boolean),
  );
  const baselineDatabases = new Set(
    normalizedBaselineTrials.map((trial) => trial.databaseLabel?.trim()).filter(Boolean),
  );
  const baselineSpread = normalizedBaselineTrials.length > 1
    ? Math.max(...normalizedBaselineTrials.map((trial) => trial.score)) -
      Math.min(...normalizedBaselineTrials.map((trial) => trial.score))
    : 0;
  const deltas = key === 'baseline' ? [] : pairedDeltas(baselineTrials, normalizedTrials);
  const pairedDeltaMedian = median(deltas);
  const pairedDeltaDeviation = standardDeviation(deltas);
  const warnings: string[] = [];
  if (normalizedTrials.length < SCORE_REVERSE_REPEAT_TARGET) warnings.push(`还需检测 ${SCORE_REVERSE_REPEAT_TARGET - normalizedTrials.length} 次`);
  if (normalizedTrials.length > 0 && nodes.size === 0) warnings.push('未记录检测节点');
  if (normalizedTrials.length > 0 && databases.size === 0) warnings.push('未记录地区数据库');
  if (nodes.size > 1) warnings.push('检测节点不一致');
  if (databases.size > 1) warnings.push('地区数据库不一致');
  const nodeMatchesBaseline =
    key === 'baseline' ||
    (nodes.size === 1 && baselineNodes.size === 1 && [...nodes][0] === [...baselineNodes][0]);
  const databaseMatchesBaseline =
    key === 'baseline' ||
    (databases.size === 1 &&
      baselineDatabases.size === 1 &&
      [...databases][0] === [...baselineDatabases][0]);
  if (!nodeMatchesBaseline) warnings.push('与基线检测节点不一致或基线节点缺失');
  if (!databaseMatchesBaseline) warnings.push('与基线地区数据库不一致或基线数据库缺失');
  if (baselineSpread > 0.2) warnings.push('基线跨轮漂移超过 0.2');
  if (deviation !== null && deviation > 0.15) warnings.push('重复检测波动偏大');
  if (pairedDeltaDeviation !== null && pairedDeltaDeviation > 0.15) {
    warnings.push('相对基线的轮次差分波动偏大');
  }
  const complete = normalizedTrials.length >= SCORE_REVERSE_REPEAT_TARGET && medianScore !== null;
  const effect = pairedDeltaMedian ?? (
    key !== 'baseline' && medianScore !== null && baselineMedian !== null
      ? round2(medianScore - baselineMedian)
      : null
  );
  const effectTooSmall = key !== 'baseline' && effect !== null && Math.abs(effect) < 0.2;
  if (effectTooSmall) warnings.push('效应小于 0.2，暂时不能视为可操作规则');
  const confidence = !complete
    ? 'insufficient'
    : nodes.size === 1 &&
        databases.size === 1 &&
        nodeMatchesBaseline &&
        databaseMatchesBaseline &&
        baselineSpread <= 0.2 &&
        (deviation ?? 0) <= 0.1 &&
        !effectTooSmall
        ? 'medium'
        : 'low';
  const meta = key === 'baseline'
    ? { label: '基线原稿', summary: '不做任何修改，所有变量都与它比较' }
    : FACTOR_META[key];
  return {
    key,
    label: meta.label,
    mutationSummary: meta.summary,
    content,
    trials: normalizedTrials,
    medianScore,
    meanScore: mean(scores),
    standardDeviation: deviation,
    deltaFromBaseline: effect,
    pairedDeltaMedian,
    pairedDeltaStandardDeviation: pairedDeltaDeviation,
    pairedSampleCount: deltas.length,
    confidence,
    warnings,
  };
}

export function toScoreReverseExperimentDto(experiment: StoredScoreReverseExperiment) {
  const baselineTrials = normalizeTrials(experiment.trials.baseline ?? []);
  const baselineMedian = median(baselineTrials.map((trial) => trial.score));
  const baselineSpread = baselineTrials.length > 1
    ? round2(Math.max(...baselineTrials.map((trial) => trial.score)) - Math.min(...baselineTrials.map((trial) => trial.score)))
    : null;
  const variants = [
    analyzeVariant('baseline', experiment.baselineContent, baselineTrials, baselineMedian, baselineTrials),
    ...experiment.factors.map((factor) =>
      analyzeVariant(
        factor,
        buildScoreReverseVariantContent(experiment.baselineContent, experiment.targetKeyword, factor),
        experiment.trials[factor] ?? [],
        baselineMedian,
        baselineTrials,
      ),
    ),
  ];
  return {
    ...experiment,
    aiAnalysis: experiment.aiAnalysis
      ? {
          ...experiment.aiAnalysis,
          stale: experiment.aiAnalysis.basedOnUpdatedAt !== experiment.updatedAt,
        }
      : undefined,
    variants,
    baselineSpread,
    baselineDriftDetected: baselineSpread !== null && baselineSpread > 0.2,
    completedVariants: variants.filter((variant) => variant.trials.length >= SCORE_REVERSE_REPEAT_TARGET).length,
    totalVariants: variants.length,
  };
}

export function aggregateScoreReverseRuleEvidence(
  experiments: StoredScoreReverseExperiment[],
): ScoreReverseRuleEvidence[] {
  return SCORE_REVERSE_FACTOR_KEYS.flatMap((factorKey) => {
    const rows = experiments.flatMap((experiment) => {
      if (!experiment.factors.includes(factorKey)) return [];
      const dto = toScoreReverseExperimentDto(experiment);
      const variant = dto.variants.find((item) => item.key === factorKey);
      const baseline = dto.variants.find((item) => item.key === 'baseline');
      if (!variant || variant.deltaFromBaseline === null || variant.trials.length < SCORE_REVERSE_REPEAT_TARGET) {
        return [];
      }
      const nodes = variant.trials.map((trial) => trial.nodeLabel?.trim()).filter(Boolean) as string[];
      const databases = variant.trials.map((trial) => trial.databaseLabel?.trim()).filter(Boolean) as string[];
      const baselineNodes = baseline?.trials.map((trial) => trial.nodeLabel?.trim()).filter(Boolean) as string[] | undefined;
      const baselineDatabases = baseline?.trials.map((trial) => trial.databaseLabel?.trim()).filter(Boolean) as string[] | undefined;
      const uniqueNodes = new Set(nodes);
      const uniqueDatabases = new Set(databases);
      const uniqueBaselineNodes = new Set(baselineNodes ?? []);
      const uniqueBaselineDatabases = new Set(baselineDatabases ?? []);
      const eligible =
        variant.pairedSampleCount >= SCORE_REVERSE_REPEAT_TARGET &&
        !dto.baselineDriftDetected &&
        uniqueNodes.size === 1 &&
        uniqueDatabases.size === 1 &&
        uniqueBaselineNodes.size === 1 &&
        uniqueBaselineDatabases.size === 1 &&
        [...uniqueNodes][0] === [...uniqueBaselineNodes][0] &&
        [...uniqueDatabases][0] === [...uniqueBaselineDatabases][0] &&
        (variant.pairedDeltaStandardDeviation ?? 0) <= 0.2;
      return [{
        experimentId: experiment.id,
        articleHash: hashScoreReverseContent(experiment.baselineContent),
        delta: variant.deltaFromBaseline,
        nodes,
        eligible,
      }];
    });
    if (rows.length === 0) return [];

    const eligibleRows = rows.filter((row) => row.eligible);
    const statisticalRows = eligibleRows.length > 0 ? eligibleRows : rows;
    const deltas = statisticalRows.map((row) => row.delta);
    const medianDelta = median(deltas);
    const dominantDirection = Math.sign(medianDelta ?? 0);
    const directional = deltas.filter((delta) => Math.abs(delta) >= 0.1);
    const directionConsistency = dominantDirection === 0 || directional.length === 0
      ? null
      : round2(
          directional.filter((delta) => Math.sign(delta) === dominantDirection).length /
            directional.length,
        );
    const articleCount = new Set(eligibleRows.map((row) => row.articleHash)).size;
    const nodeCount = new Set(eligibleRows.flatMap((row) => row.nodes)).size;
    const meaningfulEffect = Math.abs(medianDelta ?? 0) >= 0.2;
    const validated =
      articleCount >= 10 &&
      nodeCount >= 2 &&
      meaningfulEffect &&
      (directionConsistency ?? 0) >= 0.8;
    const replicated =
      articleCount >= 5 && meaningfulEffect && (directionConsistency ?? 0) >= 0.7;
    const inconclusive =
      articleCount >= 5 && (!meaningfulEffect || (directionConsistency ?? 0) < 0.6);
    const status: ScoreReverseRuleStatus = validated
      ? 'validated'
      : replicated
        ? 'replicated'
        : inconclusive
          ? 'inconclusive'
          : 'candidate';
    const warnings: string[] = [];
    if (eligibleRows.length < rows.length) {
      warnings.push(`${rows.length - eligibleRows.length} 组因上下文缺失、节点不一致或漂移未计入晋级`);
    }
    if (articleCount < 5) warnings.push(`还需至少 ${5 - articleCount} 篇不同文章完成初步复现`);
    if (nodeCount < 2) warnings.push('尚未跨节点验证');
    if (!meaningfulEffect) warnings.push('中位效应小于 0.2');
    if (directionConsistency !== null && directionConsistency < 0.7) warnings.push('跨文章方向不一致');

    return [{
      factorKey,
      label: FACTOR_META[factorKey].label,
      experimentCount: rows.length,
      eligibleExperimentCount: eligibleRows.length,
      excludedExperimentCount: rows.length - eligibleRows.length,
      articleCount,
      nodeCount,
      medianDelta,
      meanDelta: mean(deltas),
      standardDeviation: standardDeviation(deltas),
      directionConsistency,
      confidence: validated ? 'high' : replicated ? 'medium' : 'low',
      status,
      warnings,
    }];
  });
}

export function createStoredScoreReverseExperiment(input: {
  name: string;
  targetKeyword: string;
  submittedKeywords?: string[];
  baselineContent: string;
  factors?: ScoreReverseFactorKey[];
}): StoredScoreReverseExperiment {
  const now = new Date().toISOString();
  return {
    id: `reverse-${randomUUID()}`,
    name: input.name.trim(),
    targetKeyword: input.targetKeyword.trim(),
    submittedKeywords: [...new Set(
      [input.targetKeyword, ...(input.submittedKeywords ?? [])]
        .map((item) => item.trim())
        .filter(Boolean),
    )].slice(0, SCORE_REVERSE_MAX_SUBMITTED_KEYWORDS),
    baselineContent: input.baselineContent.trim(),
    factors: input.factors?.length ? [...new Set(input.factors)] : [...SCORE_REVERSE_FACTOR_KEYS],
    trials: {},
    observations: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function readStoredScoreReverseExperiments(config: unknown): StoredScoreReverseExperiment[] {
  if (!config || typeof config !== 'object') return [];
  const raw = (config as Record<string, unknown>)[SCORE_REVERSE_EXPERIMENTS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is StoredScoreReverseExperiment => {
    if (!item || typeof item !== 'object') return false;
    const row = item as StoredScoreReverseExperiment;
    return typeof row.id === 'string' && typeof row.targetKeyword === 'string' && typeof row.baselineContent === 'string' && Array.isArray(row.factors);
  });
}

export function writeStoredScoreReverseExperiments(
  config: unknown,
  experiments: StoredScoreReverseExperiment[],
): Record<string, unknown> {
  const base = config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {};
  return { ...base, [SCORE_REVERSE_EXPERIMENTS_KEY]: experiments.slice(0, SCORE_REVERSE_MAX_EXPERIMENTS) };
}
