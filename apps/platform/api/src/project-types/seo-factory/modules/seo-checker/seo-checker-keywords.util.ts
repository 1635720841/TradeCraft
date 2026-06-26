/**
 * SEO 查分：关键词合并与持久化工具。
 */
import type { SeoScore } from '@wm/provider-interfaces';
import { filterSemrushRecommendedKeywords } from '../../providers/semrush/semrush-keywords.util';
import {
  extractBriefEntities,
  mergeKeywordsForWritingFromManifest,
  resolveKeywordCoverageManifest,
} from '../../utils/keyword-coverage-manifest.util';
import { mergeSemrushKeywordLists } from '../../providers/semrush/semrush-keyword-coverage.util';
import {
  buildSemrushSubmittedKeywords,
  filterSemrushSubmittedKeywordsInContent,
} from '../../providers/semrush/semrush-submitted-keywords.util';

export function mergeRecommendedKeywordsForWriting(
    briefData: unknown,
    localRecommendedKeywords: string[],
    targetKeyword: string,
    semrushRecommendedKeywords?: string[],
    options?: { semrushResult?: SeoScore | null; content?: string },
  ): string[] {
    const semrushActive =
      process.env.SEMRUSH_ENABLED === 'true' &&
      !!options?.semrushResult &&
      !options.semrushResult.skipped;

    if (semrushActive || options?.content) {
      const manifest = resolveKeywordCoverageManifest({
        content: options?.content ?? '',
        targetKeyword,
        semrushActive,
        semrushResult: options?.semrushResult,
        localMissingKeywords: localRecommendedKeywords,
        briefEntities: extractBriefEntities(briefData),
      });
      return mergeKeywordsForWritingFromManifest({
        manifest,
        briefData,
        localMissingKeywords: localRecommendedKeywords,
        targetKeyword,
        extraPhrases: mergeSemrushKeywordLists(
          options?.semrushResult?.semrushTargetKeywords,
          options?.semrushResult?.semrushMissingTargetKeywords,
        ),
      });
    }

    const briefRoot = (briefData as { outline?: Record<string, unknown> } | null)?.outline ?? {};
    const fromBrief = Array.isArray(briefRoot.recommendedEntities)
      ? briefRoot.recommendedEntities.filter((item): item is string => typeof item === 'string')
      : [];

    const main = targetKeyword.trim().toLowerCase();
    const splitParts = (items: string[]) =>
      items.flatMap((item) => item.split(/[,，]/).map((part) => part.trim()));

    const merged = [...new Set([...fromBrief, ...localRecommendedKeywords, ...(semrushRecommendedKeywords ?? [])])]
      .flatMap((item) => splitParts([item]))
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.toLowerCase() !== main);

    return filterSemrushRecommendedKeywords(merged, targetKeyword);
  }

export function resolvePersistedSubmittedKeywords(
    content: string,
    targetKeyword: string,
    poolKeywords: string[],
    semrushResult?: SeoScore,
  ): string[] {
    const raw =
      semrushResult?.semrushTargetKeywords && semrushResult.semrushTargetKeywords.length > 0
        ? semrushResult.semrushTargetKeywords
        : buildSemrushSubmittedKeywords(content, {
            targetKeyword,
            poolKeywords,
          });
    return filterSemrushSubmittedKeywordsInContent(content, raw);
  }
