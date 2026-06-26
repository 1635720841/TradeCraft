/**
 * SEO 查分：Semrush 规划反馈合并工具。
 */
import type { SeoScore } from '@wm/provider-interfaces';
import { mergeSemrushKeywordLists } from '../../providers/semrush/semrush-keyword-coverage.util';
import type { SemrushPlanningFeedback } from './seo-checker.types';

export function extractSemrushPlanningFeedback(result: SeoScore): SemrushPlanningFeedback {
    return {
      semrushCompetitorWordCount: result.semrushCompetitorWordCount,
      semrushTargetKeywords: result.semrushTargetKeywords,
      semrushRecommendedKeywords: result.semrushRecommendedKeywords,
      semrushMissingTargetKeywords: result.semrushMissingTargetKeywords,
      semrushMissingRecommendedKeywords: result.semrushMissingRecommendedKeywords,
      suggestionDetails: result.suggestionDetails,
      actionableIssues: result.actionableIssues,
    };
  }

export function mergeSemrushPlanningFeedbackState(
    current: SemrushPlanningFeedback,
    result: SeoScore,
  ): SemrushPlanningFeedback {
    const next = extractSemrushPlanningFeedback(result);
    const competitorCandidates = [
      current.semrushCompetitorWordCount,
      next.semrushCompetitorWordCount,
    ].filter((value): value is number => typeof value === 'number' && value > 0);
    return {
      semrushCompetitorWordCount:
        competitorCandidates.length > 0 ? Math.max(...competitorCandidates) : undefined,
      semrushTargetKeywords: current.semrushTargetKeywords,
      semrushRecommendedKeywords: mergeSemrushKeywordLists(
        next.semrushRecommendedKeywords,
        current.semrushRecommendedKeywords,
      ),
      semrushMissingTargetKeywords: mergeSemrushKeywordLists(
        next.semrushMissingTargetKeywords,
        current.semrushMissingTargetKeywords,
      ),
      semrushMissingRecommendedKeywords: mergeSemrushKeywordLists(
        next.semrushMissingRecommendedKeywords,
        current.semrushMissingRecommendedKeywords,
      ),
      suggestionDetails: mergeSemrushSuggestionDetails(
        current.suggestionDetails,
        next.suggestionDetails,
      ),
      actionableIssues: mergeSemrushActionableIssues(
        current.actionableIssues,
        next.actionableIssues,
      ),
    };
  }

export function mergeSemrushPlanningFeedback(
    base: SeoScore,
    feedback?: SemrushPlanningFeedback,
  ): SeoScore {
    if (!feedback) return base;
    const competitorCandidates = [
      base.semrushCompetitorWordCount,
      feedback.semrushCompetitorWordCount,
    ].filter((value): value is number => typeof value === 'number' && value > 0);
    return {
      ...base,
      semrushCompetitorWordCount:
        competitorCandidates.length > 0 ? Math.max(...competitorCandidates) : undefined,
      semrushTargetKeywords: nonEmptyKeywordList(
        base.semrushTargetKeywords?.length
          ? base.semrushTargetKeywords
          : (feedback.semrushTargetKeywords ?? []),
      ),
      semrushRecommendedKeywords: nonEmptyKeywordList(
        mergeSemrushKeywordLists(
          feedback.semrushRecommendedKeywords,
          base.semrushRecommendedKeywords,
        ),
      ),
      semrushMissingTargetKeywords: nonEmptyKeywordList(
        mergeSemrushKeywordLists(
          feedback.semrushMissingTargetKeywords,
          base.semrushMissingTargetKeywords,
        ),
      ),
      semrushMissingRecommendedKeywords: nonEmptyKeywordList(
        mergeSemrushKeywordLists(
          feedback.semrushMissingRecommendedKeywords,
          base.semrushMissingRecommendedKeywords,
        ),
      ),
      suggestionDetails: mergeSemrushSuggestionDetails(
        base.suggestionDetails,
        feedback.suggestionDetails,
      ),
      actionableIssues: mergeSemrushActionableIssues(
        base.actionableIssues,
        feedback.actionableIssues,
      ),
    };
  }

export function nonEmptyKeywordList(keywords: string[]): string[] | undefined {
    return keywords.length > 0 ? keywords : undefined;
  }

export function mergeSemrushSuggestionDetails(
    base?: SeoScore['suggestionDetails'],
    feedback?: SeoScore['suggestionDetails'],
  ): SeoScore['suggestionDetails'] | undefined {
    if (!base && !feedback) return undefined;
    const merge = (left?: string[], right?: string[]) => {
      const merged = [...new Set([...(left ?? []), ...(right ?? [])])];
      return merged.length > 0 ? merged : undefined;
    };
    return {
      readability: merge(base?.readability, feedback?.readability),
      seo: merge(base?.seo, feedback?.seo),
      tone: merge(base?.tone, feedback?.tone),
      originality: merge(base?.originality, feedback?.originality),
    };
  }

export function mergeSemrushActionableIssues(
    base?: SeoScore['actionableIssues'],
    feedback?: SeoScore['actionableIssues'],
  ): SeoScore['actionableIssues'] | undefined {
    const merged: NonNullable<SeoScore['actionableIssues']> = [];
    const seen = new Set<string>();
    for (const issue of [...(base ?? []), ...(feedback ?? [])]) {
      const key = JSON.stringify({
        category: issue.category,
        rule: issue.rule,
        label: issue.label,
        terms: issue.terms,
        quotes: issue.quotes,
      });
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(issue);
    }
    return merged.length > 0 ? merged : undefined;
  }
