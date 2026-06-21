/**
 * 文章内容评分：Semrush SWA 式输出（本地规则 + 校准 0–10）。
 *
 * 边界：
 * - 不负责：HTTP / DB（ArticleScoreService）
 * - 不负责：Semrush RPA 执行
 */

import {
  attributeScoreCalibrationDrivers,
  buildCalibrationFeatures,
  computeSemrushWordGap,
  inferSemrushWordCountTarget,
  normalizeArticleScoreContent,
  predictCalibratedSemrushScore,
  resolveArticleScoreKeywordList,
  resolveModelEvalMae,
  resolveSemrushArticleTitle,
  analyzeSemrushTitleIssues,
  applySemrushTitlePenaltyToPrediction,
  scoreLocalSeo,
  type LocalSeoScoreBreakdown,
  type LocalSeoScoreResult,
  type ScoreCalibrationFeatureDriver,
  type ScoreCalibrationFeatures,
  type ScoreCalibrationModel,
  type ScoreCalibrationPrediction,
} from '@wm/shared-core';
import {
  findMissingSemrushKeywords,
  mergeSemrushKeywordLists,
} from '../providers/semrush/semrush-keyword-coverage.util';
import { SEMRUSH_PASS_THRESHOLD } from '../constants/seo-score';

export interface ArticleContentScorePrimaryNode {
  key: string;
  label: string;
  hint: string;
}

export interface ArticleContentScoreInput {
  targetKeyword: string;
  content: string;
  submittedKeywords?: string[];
  serpOrganic?: Array<{ title?: string; snippet?: string }>;
  targetWordCount?: number;
  competitorWordCount?: number;
  priorSemrushNode?: string;
  model: ScoreCalibrationModel | null;
  /** 训练集特征均值，用于 12 维线性归因 */
  featureMeans?: ScoreCalibrationFeatures | null;
  articleTitle?: string;
}

export interface ScoreArticleContentFromLocalInput {
  localResult: LocalSeoScoreResult;
  targetKeyword: string;
  content: string;
  submittedKeywords?: string[];
  targetWordCount?: number;
  competitorWordCount?: number;
  priorSemrushNode?: string;
  model: ScoreCalibrationModel | null;
  featureMeans?: ScoreCalibrationFeatures | null;
  /** M6 已用 Semrush 规则算好的缺词数，优先于关键词表扫描 */
  missingKeywordCountOverride?: number;
  /** draft.title；未传则从正文 H1 推断 */
  articleTitle?: string;
}

export interface ArticleContentScoreResult {
  overall: number;
  passed: boolean;
  passThreshold: number;
  pointsToGo: number;
  confidence: ScoreCalibrationPrediction['confidence'];
  modelReady: boolean;
  evalMae: number | null;
  usedFallback: boolean;
  localScore: number;
  localBreakdown: LocalSeoScoreBreakdown;
  primaryNode: ArticleContentScorePrimaryNode;
  missingKeywords: string[];
  missingKeywordCount: number;
  wordCount: {
    current: number;
    competitor: number | null;
    gap: number | null;
  };
  readability: {
    flesch: number | null;
    longSentencesOver22: number;
    longParagraphsOver65: number;
  };
  suggestions: string[];
  recommendedKeywords: string[];
  /** 12 维特征归因（模型 + 训练均值就绪时返回） */
  featureAttribution: ScoreCalibrationFeatureDriver[];
}

const DIMENSION_SPECS: Array<{
  key: string;
  label: string;
  pick: (b: LocalSeoScoreBreakdown) => number;
  max: number;
}> = [
  { key: 'keyword', label: '关键词覆盖', pick: (b) => b.keywordCoverage, max: 25 },
  { key: 'serp', label: 'SERP 对齐', pick: (b) => b.serpTermAlignment, max: 25 },
  { key: 'structure', label: '文章结构', pick: (b) => b.structure, max: 20 },
  { key: 'readability', label: '可读性', pick: (b) => b.readability, max: 20 },
  { key: 'depth', label: '内容深度', pick: (b) => b.contentDepth, max: 10 },
];

export function resolveSubmittedKeywords(input: {
  targetKeyword: string;
  submittedKeywords?: string[];
  briefRecommended?: string[];
  semrushSubmitted?: string[];
  semrushRecommended?: string[];
}): string[] {
  return mergeSemrushKeywordLists(
    [input.targetKeyword],
    input.submittedKeywords,
    input.briefRecommended,
    input.semrushSubmitted,
    input.semrushRecommended,
  );
}

export function resolvePrimaryScoreNode(input: {
  breakdown: LocalSeoScoreBreakdown;
  missingKeywordCount: number;
  wordGap: number | null;
  priorSemrushNode?: string;
}): ArticleContentScorePrimaryNode {
  if (input.missingKeywordCount > 0) {
    return {
      key: 'keyword',
      label: '关键词覆盖',
      hint: `仍有 ${input.missingKeywordCount} 个 SEO 短语未写入正文`,
    };
  }
  if (input.wordGap !== null && input.wordGap >= 80) {
    return {
      key: 'word_count',
      label: '文章篇幅',
      hint: `距竞品标杆还差约 ${input.wordGap} 词`,
    };
  }

  const weakest = [...DIMENSION_SPECS].sort(
    (a, b) => a.pick(input.breakdown) / a.max - b.pick(input.breakdown) / b.max,
  )[0];
  if (weakest) {
    const ratio = Math.round((weakest.pick(input.breakdown) / weakest.max) * 100);
    return {
      key: weakest.key,
      label: weakest.label,
      hint: `该维度得分约 ${ratio}%`,
    };
  }

  if (input.priorSemrushNode?.trim()) {
    return {
      key: 'semrush_node',
      label: input.priorSemrushNode,
      hint: '沿用最近一次 Semrush 检测节点',
    };
  }

  return { key: 'general', label: '内容质量', hint: '继续优化分项可提升总分' };
}

/** 基于已有 localResult 评分（M6 优化轮避免重复 scoreLocalSeo） */
export function scoreArticleContentFromLocal(
  input: ScoreArticleContentFromLocalInput,
): ArticleContentScoreResult {
  const { localResult } = input;
  const content = normalizeArticleScoreContent(input.content);
  const keywordList = mergeSemrushKeywordLists(
    [input.targetKeyword],
    input.submittedKeywords,
  );
  const missingKeywords = findMissingSemrushKeywords(content, keywordList);
  const missingKeywordCount =
    input.missingKeywordCountOverride ?? missingKeywords.length;
  const wordGap = computeSemrushWordGap(
    localResult.metrics.wordCount,
    input.competitorWordCount,
  );

  const features = buildCalibrationFeatures({
    localScore: localResult.score,
    breakdown: localResult.breakdown,
    metrics: localResult.metrics,
    semrushContext: {
      competitorWordCount: input.competitorWordCount,
      targetWordCount:
        input.targetWordCount ??
        inferSemrushWordCountTarget(localResult.metrics.wordCount),
      missingKeywordCount,
      semrushNode: input.priorSemrushNode,
    },
  });

  const prediction = predictCalibratedSemrushScore({
    features,
    localScore: localResult.score,
    model: input.model,
  });
  const resolvedTitle = resolveSemrushArticleTitle({
    content,
    targetKeyword: input.targetKeyword,
    articleTitle: input.articleTitle,
  });
  const titleIssues = analyzeSemrushTitleIssues(resolvedTitle);
  const adjustedOverall = applySemrushTitlePenaltyToPrediction(
    prediction.predictedSemrush,
    resolvedTitle,
  );
  const adjustedPrediction: ScoreCalibrationPrediction = {
    ...prediction,
    predictedSemrush: adjustedOverall,
  };
  const featureAttribution =
    input.model && input.featureMeans
      ? attributeScoreCalibrationDrivers({
          model: input.model,
          features,
          featureMeans: input.featureMeans,
          limit: 12,
        })
      : [];

  const overall = adjustedPrediction.predictedSemrush;
  const passed = overall >= SEMRUSH_PASS_THRESHOLD;
  const pointsToGo = passed
    ? 0
    : Math.round(Math.max(0, SEMRUSH_PASS_THRESHOLD - overall) * 10) / 10;

  const titleSuggestions = titleIssues.map(
    (issue) => `[Semrush 对齐·标题] ${issue.message}`,
  );

  return {
    overall,
    passed,
    passThreshold: SEMRUSH_PASS_THRESHOLD,
    pointsToGo,
    confidence: adjustedPrediction.confidence,
    modelReady: Boolean(input.model),
    evalMae: resolveModelEvalMae(input.model),
    usedFallback: adjustedPrediction.usedFallback,
    localScore: localResult.score,
    localBreakdown: localResult.breakdown,
    primaryNode: resolvePrimaryScoreNode({
      breakdown: localResult.breakdown,
      missingKeywordCount,
      wordGap,
      priorSemrushNode: input.priorSemrushNode,
    }),
    missingKeywords: missingKeywords.slice(0, 12),
    missingKeywordCount,
    wordCount: {
      current: localResult.metrics.wordCount,
      competitor: input.competitorWordCount ?? null,
      gap: wordGap,
    },
    readability: {
      flesch: localResult.metrics.fleschReadingEase ?? null,
      longSentencesOver22: localResult.metrics.longSentencesOver22,
      longParagraphsOver65: localResult.metrics.longParagraphsOver65,
    },
    suggestions: [...titleSuggestions, ...localResult.suggestions].slice(0, 8),
    recommendedKeywords: localResult.recommendedKeywords.slice(0, 12),
    featureAttribution,
  };
}

/** 对正文做 Semrush 式内容评分（唯一算分入口，供改稿与后续替换 RPA） */
export function scoreArticleContent(input: ArticleContentScoreInput): ArticleContentScoreResult {
  const content = normalizeArticleScoreContent(input.content);
  const { primaryKeyword, keywordList } = resolveArticleScoreKeywordList({
    targetKeyword: input.targetKeyword,
    submittedKeywords: input.submittedKeywords,
  });
  const localResult = scoreLocalSeo({
    keyword: primaryKeyword,
    submittedKeywords: keywordList.length > 1 ? keywordList.slice(1) : undefined,
    content,
    serpOrganic: input.serpOrganic,
    targetWordCount: input.targetWordCount,
    competitorWordCount: input.competitorWordCount,
  });

  return scoreArticleContentFromLocal({
    localResult,
    targetKeyword: primaryKeyword,
    content,
    submittedKeywords: keywordList,
    targetWordCount: input.targetWordCount,
    competitorWordCount: input.competitorWordCount,
    priorSemrushNode: input.priorSemrushNode,
    model: input.model,
    featureMeans: input.featureMeans,
    articleTitle: input.articleTitle,
  });
}

export function toScoreCalibrationPrediction(
  result: ArticleContentScoreResult,
  model: ScoreCalibrationModel | null,
): ScoreCalibrationPrediction {
  return {
    predictedSemrush: result.overall,
    confidence: result.confidence,
    modelSampleCount: model?.sampleCount ?? 0,
    usedFallback: result.usedFallback,
  };
}

export function extractSemrushHintsFromJob(seoCheckData: unknown): {
  competitorWordCount?: number;
  priorSemrushNode?: string;
  submittedKeywords?: string[];
  semrushRecommended?: string[];
} {
  const data = (seoCheckData ?? {}) as {
    semrush?: {
      semrushCompetitorWordCount?: number;
      node?: string;
      nodeLabel?: string;
      submittedKeywords?: string[];
      semrushRecommendedKeywords?: string[];
    };
  };
  const semrush = data.semrush;
  return {
    competitorWordCount:
      typeof semrush?.semrushCompetitorWordCount === 'number'
        ? semrush.semrushCompetitorWordCount
        : undefined,
    priorSemrushNode: semrush?.nodeLabel ?? semrush?.node,
    submittedKeywords: semrush?.submittedKeywords,
    semrushRecommended: semrush?.semrushRecommendedKeywords,
  };
}

export function extractBriefRecommendedKeywords(briefData: unknown): string[] {
  const brief = (briefData ?? {}) as { recommendedKeywords?: string[] };
  return Array.isArray(brief.recommendedKeywords) ? brief.recommendedKeywords : [];
}

export function extractSerpOrganic(serpData: unknown): Array<{ title?: string; snippet?: string }> {
  const serp = (serpData ?? {}) as { organic?: Array<{ title?: string; snippet?: string }> };
  return Array.isArray(serp.organic) ? serp.organic : [];
}

/** 从 brief 取目标篇幅 */
export function extractTargetWordCount(briefData: unknown): number | undefined {
  const brief = (briefData ?? {}) as { targetWordCount?: number };
  return typeof brief.targetWordCount === 'number' ? brief.targetWordCount : undefined;
}
