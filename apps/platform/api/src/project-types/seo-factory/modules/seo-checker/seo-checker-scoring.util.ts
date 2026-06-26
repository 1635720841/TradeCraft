/**
 * SEO 查分：本地评分与 Semrush 元数据工具。
 */
import {
  scoreLocalSeo,
  type LocalSeoScoreResult,
} from '@wm/shared-core';
import type { SeoScore } from '@wm/provider-interfaces';
import type { LlmJobContext } from '../llm/llm.service';
import type { SeoFlowContext } from '../../utils/seo-pipeline-flow-log.util';
import type { GenerateOptimizeMeta } from '../llm/llm.service';
import {
  buildSemrushWordCountPlan,
} from '@wm/shared-core';
import { buildSemrushOptimizeContext } from '../../utils/semrush-optimize.util';
import {
  collectPresentSeoPhrases,
  findMissingSemrushKeywords,
  mergeSemrushKeywordLists,
  resolveAllSemrushMissingKeywordsForRound,
} from '../../providers/semrush/semrush-keyword-coverage.util';
import { formatFocusDimensions } from '../llm/optimize-history-context.util';
import type { ResolvedSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import type { SerpOrganicRow, PersistedSeoCheckData } from './seo-checker.types';

export function evaluateLocal(
    keyword: string,
    content: string,
    serpData: { organic?: SerpOrganicRow[] } | null,
    targetWordCount: number,
    semrushHints?: {
      readabilityTarget?: number;
      competitorWordCount?: number;
    },
  ): LocalSeoScoreResult {
    return scoreLocalSeo({
      keyword,
      content,
      serpOrganic: serpData?.organic,
      targetWordCount,
      readabilityTarget: semrushHints?.readabilityTarget,
      competitorWordCount: semrushHints?.competitorWordCount,
    });
  }

export function formatLocalScoreBreakdown(result: LocalSeoScoreResult): string {
    const b = result.breakdown;
    const lines = [
      `当前总分 ${result.score}/100`,
      `- 关键词 ${b.keywordCoverage}/25（开篇含词 + 动态密度 + H2 模糊匹配）`,
      `- SERP 词 ${b.serpTermAlignment}/25（已对齐 ${result.metrics.matchedSerpTerms}/${result.metrics.totalSerpTerms}）`,
      `- 结构 ${b.structure}/20（H2≥4 + 篇幅 70–105% + 列表）`,
      `- 可读性 ${b.readability}/20（≤65 词/段、≤22 词/句、少被动）`,
      `- 深度 ${b.contentDepth}/10（≥700 词 + 术语丰富）`,
    ];
    if (result.recommendedKeywords.length > 0) {
      lines.push(`- 尚未覆盖的 SERP 词（语境化融合）：${result.recommendedKeywords.slice(0, 12).join('、')}`);
    }
    return lines.join('\n');
  }

export function collectProtectedSeoPhrases(
    content: string,
    targetKeyword: string,
    recommendedKeywords: string[],
  ): string[] {
    return collectPresentSeoPhrases(content, [targetKeyword, ...recommendedKeywords]);
  }

export function countSemrushMissingKeywords(
    content: string,
    targetKeyword: string,
    semrushResult: SeoScore,
    extraKeywords?: string[],
    submittedKeywords?: string[],
  ): number {
    const submitted =
      submittedKeywords && submittedKeywords.length > 0
        ? submittedKeywords
        : mergeSemrushKeywordLists(
            [targetKeyword],
            semrushResult.semrushTargetKeywords,
            extraKeywords,
          );
    const manifest = semrushResult.keywordCoverage
      ? {
          source: semrushResult.keywordCoverage.source,
          recommended: semrushResult.keywordCoverage.recommended,
          missing: semrushResult.keywordCoverage.missing,
          coveredCount: semrushResult.keywordCoverage.coveredCount,
          totalCount: semrushResult.keywordCoverage.totalCount,
          coverageRate: semrushResult.keywordCoverage.coverageRate,
        }
      : undefined;
    return resolveAllSemrushMissingKeywordsForRound({
      content,
      semrushResult,
      manifest,
      submittedKeywords: submitted,
      targetKeyword,
    }).length;
  }

export function countSemrushMissingSubmittedKeywords(
    content: string,
    targetKeyword: string,
    submittedKeywords?: string[],
  ): number {
    const submitted = mergeSemrushKeywordLists([targetKeyword], submittedKeywords);
    return findMissingSemrushKeywords(content, submitted).length;
  }

export function buildSemrushOptimizeMeta(
    input: {
      round: number;
      content: string;
      semrushResult: SeoScore;
      localResult: LocalSeoScoreResult;
      semrushOptCtx: ReturnType<typeof buildSemrushOptimizeContext>;
      protectedSeoPhrases: string[];
      scoreConfig: ResolvedSiteSeoScoreConfig;
      roundAction?: 'semrush_keyword_first' | 'semrush_optimize';
      keywordBatch?: string[];
    },
  ): GenerateOptimizeMeta {
    const wordPlan = buildSemrushWordCountPlan({
      content: input.content,
      competitorWordCount: input.semrushResult.semrushCompetitorWordCount,
      apiReportedWords: input.semrushResult.semrushCurrentWordCount,
    });
    return {
      phase: 'semrush',
      round: input.round,
      semrushEvaluationRoute: input.semrushResult.semrushEvaluationRoute,
      scoreBefore: input.semrushResult.overall,
      semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
      semrushCurrentWordCount: wordPlan.effectiveCurrentWords,
      semrushLocalExpandWordTarget: wordPlan.localExpandTarget,
      localWordCount: wordPlan.localWordCount,
      semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
      localScore: input.localResult.score,
      localScoreTarget: input.scoreConfig.localPassThreshold,
      localScoreBreakdown: formatLocalScoreBreakdown(input.localResult),
      focusDimensions: formatFocusDimensions(input.localResult.breakdown),
      readabilityPriority: input.semrushOptCtx.readabilityPriority,
      wordCountExpandPriority: input.semrushOptCtx.wordCountExpandPriority,
      wordCountTrimPriority: input.semrushOptCtx.wordCountTrimPriority,
      readabilityAudit: input.semrushOptCtx.readabilityAudit,
      pointsToGo: input.semrushOptCtx.pointsToGo,
      scoreGapPlan: input.semrushOptCtx.scoreGapPlan,
      protectedSeoPhrases: input.protectedSeoPhrases,
      roundAction: input.roundAction,
      keywordBatch: input.keywordBatch,
    };
  }

export function flowCtx(ctx: LlmJobContext): SeoFlowContext {
    return {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
    };
  }

export function restoreSemrushResult(
    semrush: NonNullable<PersistedSeoCheckData['semrush']>,
    overall: number,
  ): SeoScore {
    return {
      overall,
      suggestions: semrush.suggestions ?? [],
      node: semrush.node,
      nodeLabel: semrush.nodeLabel,
      suggestionDetails: semrush.suggestionDetails,
      actionableIssues: semrush.actionableIssues,
      analysisSource: semrush.analysisSource,
      apiUrls: semrush.apiUrls,
      semrushCompetitorWordCount: semrush.semrushCompetitorWordCount,
      semrushCurrentWordCount: semrush.semrushCurrentWordCount,
      semrushReadabilityScore: semrush.semrushReadabilityScore,
      semrushEvaluationRoute: semrush.semrushEvaluationRoute,
      semrushEvaluationContentFingerprint: semrush.semrushEvaluationContentFingerprint,
      semrushTargetKeywords: semrush.semrushTargetKeywords,
      semrushRecommendedKeywords: semrush.semrushRecommendedKeywords,
      semrushMissingTargetKeywords: semrush.semrushMissingTargetKeywords,
      semrushMissingRecommendedKeywords: semrush.semrushMissingRecommendedKeywords,
      keywordCoverage: semrush.keywordCoverage,
      semrushCheckRecord: semrush.semrushCheckRecord,
    };
  }
