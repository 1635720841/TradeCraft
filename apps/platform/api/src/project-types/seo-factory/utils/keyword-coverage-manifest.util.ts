/**
 * 关键词覆盖清单：Semrush API / 本地 SERP / Brief 统一适配。
 *
 * Semrush 关闭时仅走 local+brief，不依赖 RPA 字段。
 */

import type { SeoScore, SeoKeywordCoverageSnapshot } from '@wm/provider-interfaces';
import {
  buildKeywordCoverageManifest,
  manifestToCoverageSnapshot,
  mergeKeywordsForWriting,
  refreshKeywordCoverageManifest,
  type SeoKeywordCoverageManifest,
  type SeoKeywordCoverageSource,
} from '@wm/shared-core';
import {
  isSemrushOffTopicKeyword,
  isSemrushSpecificKeyword,
} from '../providers/semrush/semrush-keywords.util';
import { mergeSemrushKeywordLists, isSemrushKeywordStrictlyPresent } from '../providers/semrush/semrush-keyword-coverage.util';
import type { SemrushRecommendationsPayload } from '../providers/semrush/semrush-recommendations.parser';
import { parseSemrushKeywordEntries } from '../providers/semrush/semrush-recommendations.parser';

export interface ResolveKeywordCoverageManifestInput {
  content: string;
  targetKeyword: string;
  /** Semrush 是否启用且本次有有效评测结果 */
  semrushActive: boolean;
  semrushResult?: SeoScore | null;
  /** 本地 SERP 缺失词（semrush 关闭时的主词表） */
  localMissingKeywords?: string[];
  briefEntities?: string[];
  /** 直接传入 API payload（测试/快照回放） */
  apiPayload?: SemrushRecommendationsPayload | null;
}

function mapEntries(
  entries: Array<{ keyword: string; frequency?: string; difficulty?: number }>,
) {
  return entries.map((entry) => ({
    phrase: entry.keyword,
    frequency: entry.frequency,
    difficulty: entry.difficulty,
  }));
}

/** 从 Semrush API JSON 构建清单（recommended_keywords 为待覆盖真源） */
export function buildManifestFromSemrushApiPayload(
  payload: SemrushRecommendationsPayload,
  content: string,
): SeoKeywordCoverageManifest {
  const { extracted, recommended } = parseSemrushKeywordEntries(payload);
  return buildKeywordCoverageManifest({
    source: 'semrush',
    recommendedPhrases: mapEntries(recommended),
    extractedPhrases: mapEntries(extracted),
    content,
    isPresent: isSemrushKeywordStrictlyPresent,
  });
}

/** 从 SeoScore + 可选 API payload 构建/刷新清单 */
export function buildManifestFromSemrushScore(
  semrushResult: SeoScore,
  content: string,
  targetKeyword = '',
  apiPayload?: SemrushRecommendationsPayload | null,
): SeoKeywordCoverageManifest {
  if (apiPayload) {
    return buildManifestFromSemrushApiPayload(apiPayload, content);
  }

  const recommendedPhrases = mergeSemrushKeywordLists(
    semrushResult.semrushRecommendedKeywords,
    semrushResult.semrushMissingRecommendedKeywords,
    semrushResult.keywordCoverage?.recommended.map((item) => item.phrase),
  ).map((phrase) => {
    const meta = semrushResult.keywordCoverage?.recommended.find(
      (item) => item.phrase.toLowerCase() === phrase.toLowerCase(),
    );
    return {
      phrase,
      frequency: meta?.frequency,
      difficulty: meta?.difficulty,
    };
  }).filter((item) => !isSemrushOffTopicKeyword(item.phrase, targetKeyword, content));

  const domExtras = semrushResult.semrushMissingRecommendedKeywords ?? [];
  for (const phrase of domExtras) {
    if (isSemrushOffTopicKeyword(phrase, targetKeyword, content)) continue;
    if (
      !recommendedPhrases.some((item) => item.phrase.toLowerCase() === phrase.toLowerCase())
    ) {
      recommendedPhrases.push({
        phrase,
        frequency: undefined,
        difficulty: undefined,
      });
    }
  }

  return buildKeywordCoverageManifest({
    source: 'semrush',
    recommendedPhrases,
    content,
    isPresent: isSemrushKeywordStrictlyPresent,
  });
}

/** 本地 SERP + Brief（Semrush 关闭或初检前） */
export function buildManifestFromLocalContext(
  content: string,
  localMissingKeywords: string[],
  briefEntities: string[] = [],
): SeoKeywordCoverageManifest {
  const recommendedPhrases = [...new Set([...localMissingKeywords, ...briefEntities])].map(
    (phrase) => ({ phrase }),
  );
  return buildKeywordCoverageManifest({
    source: localMissingKeywords.length > 0 ? 'local' : 'brief',
    recommendedPhrases,
    content,
  });
}

export function resolveKeywordCoverageManifest(
  input: ResolveKeywordCoverageManifestInput,
): SeoKeywordCoverageManifest {
  const briefEntities = input.briefEntities ?? [];
  const localMissing = input.localMissingKeywords ?? [];

  if (input.apiPayload) {
    return buildManifestFromSemrushApiPayload(input.apiPayload, input.content);
  }

  if (
    input.semrushActive &&
    input.semrushResult &&
    !input.semrushResult.skipped &&
    (input.semrushResult.semrushRecommendedKeywords?.length ||
      input.semrushResult.keywordCoverage ||
      input.semrushResult.semrushMissingRecommendedKeywords?.length)
  ) {
    return buildManifestFromSemrushScore(input.semrushResult, input.content, input.targetKeyword);
  }

  return buildManifestFromLocalContext(input.content, localMissing, briefEntities);
}

export function attachKeywordCoverageToScore(
  score: SeoScore,
  manifest: SeoKeywordCoverageManifest,
): SeoScore {
  const snapshot = manifestToCoverageSnapshot(manifest);
  return {
    ...score,
    keywordCoverage: snapshot,
    semrushRecommendedKeywords: manifest.recommended.map((item) => item.phrase),
    semrushMissingRecommendedKeywords:
      manifest.missing.length > 0 ? manifest.missing : undefined,
  };
}

export function refreshScoreKeywordCoverage(
  score: SeoScore,
  content: string,
): SeoScore {
  if (!score.keywordCoverage) {
    return attachKeywordCoverageToScore(
      score,
      buildManifestFromSemrushScore(score, content),
    );
  }

  const manifest: SeoKeywordCoverageManifest = {
    ...score.keywordCoverage,
    extracted: undefined,
  };
  const refreshed = refreshKeywordCoverageManifest(manifest, content);
  return attachKeywordCoverageToScore(score, refreshed);
}

export function extractBriefEntities(briefData: unknown): string[] {
  const briefRoot = (briefData as { outline?: Record<string, unknown> } | null)?.outline ?? {};
  return Array.isArray(briefRoot.recommendedEntities)
    ? briefRoot.recommendedEntities.filter((item): item is string => typeof item === 'string')
    : [];
}

export function mergeKeywordsForWritingFromManifest(input: {
  manifest: SeoKeywordCoverageManifest | null;
  briefData: unknown;
  localMissingKeywords: string[];
  targetKeyword: string;
  extraPhrases?: string[];
}): string[] {
  return mergeKeywordsForWriting({
    manifest: input.manifest,
    briefEntities: extractBriefEntities(input.briefData),
    localMissing: input.localMissingKeywords,
    targetKeyword: input.targetKeyword,
    extraPhrases: input.extraPhrases,
    isSpecificPhrase: (phrase) => isSemrushSpecificKeyword(phrase, false),
  });
}

export function formatKeywordCoverageSummary(
  manifest: SeoKeywordCoverageManifest,
  source?: SeoKeywordCoverageSource,
): string {
  const label =
    (source ?? manifest.source) === 'semrush'
      ? 'SWA 推荐词'
      : manifest.source === 'local'
        ? 'SERP 实体词'
        : 'Brief 实体词';
  const pct = Math.round(manifest.coverageRate * 100);
  return `${label}覆盖 ${manifest.coveredCount}/${manifest.totalCount}（${pct}%）`;
}

export type { SeoKeywordCoverageManifest, SeoKeywordCoverageSnapshot };
