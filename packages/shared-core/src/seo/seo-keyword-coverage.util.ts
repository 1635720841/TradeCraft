/**
 * SEO 关键词覆盖清单（评分源无关）。
 *
 * Semrush SWA 与本地 SERP 预检共用同一套「待覆盖词表 + 硬校验」模型；
 * 关闭 Semrush 时走 source=local，不依赖 RPA/API。
 *
 * 边界：
 * - 不负责：RPA、LLM 调用
 * - 不负责：Semrush API JSON 解析（由 api 层适配后传入）
 */

import { isSemrushKeywordPresentInContent } from './semrush-keyword-match.util';

export type SeoKeywordCoverageSource = 'semrush' | 'local' | 'brief';

export type SeoKeywordCoverageRole = 'recommended' | 'extracted' | 'target';

export interface SeoKeywordCoverageItem {
  phrase: string;
  covered: boolean;
  frequency?: string;
  difficulty?: number;
  role: SeoKeywordCoverageRole;
}

/** 持久化/接口层用的轻量快照 */
export interface SeoKeywordCoverageSnapshot {
  source: SeoKeywordCoverageSource;
  recommended: SeoKeywordCoverageItem[];
  missing: string[];
  coveredCount: number;
  totalCount: number;
  coverageRate: number;
}

/** 优化轮内存用的完整清单 */
export interface SeoKeywordCoverageManifest extends SeoKeywordCoverageSnapshot {
  /** SWA 从正文提取的词（只读，不作为待覆盖目标） */
  extracted?: SeoKeywordCoverageItem[];
}

export const SEO_KEYWORD_COVERAGE_BATCH_SIZE = 6;
export const SEO_KEYWORD_COVERAGE_MIN_RATE = 0.95;
export const SEO_KEYWORD_COVERAGE_MAX_SUB_ROUNDS = 4;
export const SEO_KEYWORD_COVERAGE_WRITING_MAX = 30;

const EXTRACTED_NOISE_RE = /^(it|he|she|they|this|that|we|you|as|yet|so)\s+/i;

const FREQUENCY_PRIORITY: Record<string, number> = {
  High: 4,
  Medium: 3,
  Low: 2,
  'Very Low': 1,
};

/** SWA 文档提取噪声：碎片句、代词开头短语等 */
export function isExtractedKeywordNoise(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (EXTRACTED_NOISE_RE.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !trimmed.includes('-') && !/\d/.test(trimmed)) {
    return true;
  }
  return false;
}

export type KeywordPresenceChecker = (content: string, phrase: string) => boolean;

function defaultPresenceChecker(content: string, phrase: string): boolean {
  return isSemrushKeywordPresentInContent(content, phrase);
}

function finalizeManifest(
  source: SeoKeywordCoverageSource,
  recommended: SeoKeywordCoverageItem[],
  extracted: SeoKeywordCoverageItem[],
): SeoKeywordCoverageManifest {
  const missing = recommended.filter((item) => !item.covered).map((item) => item.phrase);
  const coveredCount = recommended.length - missing.length;
  const totalCount = recommended.length;
  return {
    source,
    recommended,
    missing,
    coveredCount,
    totalCount,
    coverageRate: totalCount > 0 ? coveredCount / totalCount : 1,
    extracted: extracted.length > 0 ? extracted : undefined,
  };
}

/** 由推荐词表 + 正文构建覆盖清单 */
export function buildKeywordCoverageManifest(input: {
  source: SeoKeywordCoverageSource;
  recommendedPhrases: Array<{ phrase: string; frequency?: string; difficulty?: number }>;
  extractedPhrases?: Array<{ phrase: string; frequency?: string; difficulty?: number }>;
  content: string;
  isPresent?: KeywordPresenceChecker;
}): SeoKeywordCoverageManifest {
  const isPresent = input.isPresent ?? defaultPresenceChecker;
  const recommended: SeoKeywordCoverageItem[] = [];
  const seen = new Set<string>();

  for (const entry of input.recommendedPhrases) {
    const phrase = entry.phrase.trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recommended.push({
      phrase,
      frequency: entry.frequency,
      difficulty: entry.difficulty,
      role: 'recommended',
      covered: isPresent(input.content, phrase),
    });
  }

  const extracted: SeoKeywordCoverageItem[] = [];
  const extractedSeen = new Set<string>();
  for (const entry of input.extractedPhrases ?? []) {
    const phrase = entry.phrase.trim();
    if (!phrase || isExtractedKeywordNoise(phrase)) continue;
    const key = phrase.toLowerCase();
    if (extractedSeen.has(key)) continue;
    extractedSeen.add(key);
    extracted.push({
      phrase,
      frequency: entry.frequency,
      difficulty: entry.difficulty,
      role: 'extracted',
      covered: isPresent(input.content, phrase),
    });
  }

  return finalizeManifest(input.source, recommended, extracted);
}

/** 正文变更后刷新覆盖状态（不重算词表） */
export function refreshKeywordCoverageManifest(
  manifest: SeoKeywordCoverageManifest,
  content: string,
  isPresent: KeywordPresenceChecker = defaultPresenceChecker,
): SeoKeywordCoverageManifest {
  const recommended = manifest.recommended.map((item) => ({
    ...item,
    covered: isPresent(content, item.phrase),
  }));
  const extracted = manifest.extracted?.map((item) => ({
    ...item,
    covered: isPresent(content, item.phrase),
  }));
  return finalizeManifest(manifest.source, recommended, extracted ?? []);
}

export function manifestToCoverageSnapshot(
  manifest: SeoKeywordCoverageManifest,
): SeoKeywordCoverageSnapshot {
  return {
    source: manifest.source,
    recommended: manifest.recommended,
    missing: manifest.missing,
    coveredCount: manifest.coveredCount,
    totalCount: manifest.totalCount,
    coverageRate: manifest.coverageRate,
  };
}

export function shouldRunKeywordCoveragePass(
  manifest: SeoKeywordCoverageManifest | null | undefined,
  minRate = SEO_KEYWORD_COVERAGE_MIN_RATE,
): boolean {
  if (!manifest || manifest.totalCount === 0) return false;
  return manifest.coverageRate < minRate && manifest.missing.length > 0;
}

export function prioritizeMissingKeywords(
  missing: string[],
  items: SeoKeywordCoverageItem[],
): string[] {
  const byPhrase = new Map(items.map((item) => [item.phrase.toLowerCase(), item]));
  return [...missing].sort((a, b) => {
    const fa = FREQUENCY_PRIORITY[byPhrase.get(a.toLowerCase())?.frequency ?? ''] ?? 0;
    const fb = FREQUENCY_PRIORITY[byPhrase.get(b.toLowerCase())?.frequency ?? ''] ?? 0;
    return fb - fa || b.length - a.length;
  });
}

export function pickKeywordCoverageBatch(
  manifest: SeoKeywordCoverageManifest,
  batchIndex: number,
  batchSize = SEO_KEYWORD_COVERAGE_BATCH_SIZE,
): string[] {
  const ordered = prioritizeMissingKeywords(manifest.missing, manifest.recommended);
  const start = batchIndex * batchSize;
  return ordered.slice(start, start + batchSize);
}

export interface MergeKeywordsForWritingOptions {
  manifest?: SeoKeywordCoverageManifest | null;
  briefEntities?: string[];
  localMissing?: string[];
  targetKeyword: string;
  maxCount?: number;
  /** SWA 目标关键词等额外短语 */
  extraPhrases?: string[];
  /** 过滤过泛词；Semrush 关闭时可传宽松实现 */
  isSpecificPhrase?: (phrase: string) => boolean;
}

const defaultIsSpecificPhrase = (phrase: string): boolean => {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 || phrase.includes('-');
};

/** 供 LLM / SWA 提交用的合并词表：以 manifest 推荐词 + 缺失词为主 */
export function mergeKeywordsForWriting(options: MergeKeywordsForWritingOptions): string[] {
  const maxCount = options.maxCount ?? SEO_KEYWORD_COVERAGE_WRITING_MAX;
  const isSpecific = options.isSpecificPhrase ?? defaultIsSpecificPhrase;
  const main = options.targetKeyword.trim().toLowerCase();
  const result: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    for (const part of raw.split(/[,，]/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (key === main || seen.has(key)) continue;
      if (!isSpecific(trimmed)) continue;
      seen.add(key);
      result.push(trimmed);
    }
  };

  if (options.manifest) {
    for (const item of prioritizeMissingKeywords(
      options.manifest.missing,
      options.manifest.recommended,
    )) {
      push(item);
    }
    for (const item of options.manifest.recommended) {
      push(item.phrase);
    }
  }

  for (const item of options.briefEntities ?? []) push(item);
  for (const item of options.localMissing ?? []) push(item);
  for (const item of options.extraPhrases ?? []) push(item);

  return result.slice(0, maxCount);
}

/** 9.5+ SWA 高分文章的关键词融合范式 */
export const HIGH_SCORE_KEYWORD_WEAVING_EXEMPLARS = [
  '长尾问句作 H2：how can i get rid of blisters → ## How Can I Get Rid of Blisters on Feet?',
  '长尾问句作 H2：cure for blistered feet → ## Is There a Cure for Blistered Feet?',
  '症状口语化：teeth crunching → "hearing teeth crunching at night"',
  '实体词作 H2：blood blister → ## What Does a Blood Blister Look Like?',
  'B2B 能力句：peak demand → "EMS helps shave peak demand charges during summer afternoons"',
] as const;

/** 专用关键词覆盖轮 Prompt 建议（中英文混排，与现有 suggestions 格式一致） */
export function buildKeywordCoveragePassSuggestions(
  manifest: SeoKeywordCoverageManifest,
  batch: string[],
): string[] {
  if (batch.length === 0) return [];

  const pct = Math.round(manifest.coverageRate * 100);
  const preview = batch.join(', ');
  const exemplarBlock = HIGH_SCORE_KEYWORD_WEAVING_EXEMPLARS.map((line) => `- ${line}`).join('\n');

  return [
    `[SEO·关键词覆盖·必做] 当前覆盖 ${manifest.coveredCount}/${manifest.totalCount}（${pct}%），本轮须融入：${preview}。`,
    '每个短语在正文中自然出现至少 1 次；禁止文末竖排列表或 "relevant search terms include..." 凑句。',
    '融合方式（择一）：1) 长尾作 H2/H3 问句；2) 写入能力/效益描述句；3) 段内定义或设问。',
    '',
    '高分样例：',
    exemplarBlock,
    '',
    `[SEO·保护] 已覆盖的 ${manifest.coveredCount} 个推荐词不得删除或改写原句。`,
  ];
}
