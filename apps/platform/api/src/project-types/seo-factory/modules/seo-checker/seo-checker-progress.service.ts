/**
 * SEO 查分：进度持久化与草稿富化恢复。
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { buildScoreThresholdsSnapshot } from '../../constants/site-seo-score-settings';
import {
  appendSeoAnalysisSnapshot,
  buildLocalAnalysisSnapshot,
  buildSemrushAnalysisSnapshot,
} from '../../utils/seo-analysis-snapshot.util';
import type { LlmJobContext } from '../llm/llm.service';
import type { ArticleImageRecord } from '../illustration/article-image.util';
import { reconcileArticleImagesFromContent, countEffectiveMarkdownImages, isPlaceholderImageUrl, stripPlaceholderMarkdownImages } from '../illustration/article-image.util';
import { SWA_MIN_IMAGES } from '../../constants/swa-content';
import {
  countMissingEnrichments,
  mergeDraftEnrichments,
} from '../illustration/draft-enrichment.util';
import type { InternalLinkRecord } from '../linking/link-match.util';
import type { SemrushCheckPending } from '../../constants/semrush-check';
import type { LocalSeoScoreResult } from '@wm/shared-core';
import type { SeoScore } from '@wm/provider-interfaces';
import type { ResolvedSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import type { WorkflowProgress, PersistedSeoCheckData } from './seo-checker.types';
import {
  countSemrushMissingKeywords,
  resolveFrozenLocalScoreFields,
} from './seo-checker-scoring.util';
import { resolvePersistedSubmittedKeywords } from './seo-checker-keywords.util';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class SeoCheckerProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly logger: LoggerService,
  ) {}

  mergeSemrushRpaSnapshot(
    seoCheckData: Record<string, unknown>,
    input: {
      content: string;
      targetKeyword: string;
      recommendedKeywords: string[];
      semrushResult: SeoScore;
      localResult: LocalSeoScoreResult;
      round?: number;
      kind?: 'semrush_check' | 'semrush_manual_check';
      rolledBack?: boolean;
    },
  ): Record<string, unknown> {
    if (input.semrushResult.skipped || input.semrushResult.calibrationProxy === true) {
      return seoCheckData;
    }
    const submittedKeywords = resolvePersistedSubmittedKeywords(
      input.content,
      input.targetKeyword,
      input.recommendedKeywords,
      input.semrushResult,
    );
    return appendSeoAnalysisSnapshot(
      seoCheckData,
      buildSemrushAnalysisSnapshot({
        content: input.content,
        targetKeyword: input.targetKeyword,
        submittedKeywords,
        semrushResult: input.semrushResult,
        localResult: input.localResult,
        round: input.round,
        kind: input.kind,
        includeFullContent: true,
        semrushMissingKeywordCount: countSemrushMissingKeywords(
          input.content,
          input.targetKeyword,
          input.semrushResult,
          input.recommendedKeywords,
          submittedKeywords,
        ),
        rolledBack: input.rolledBack,
      }),
    );
  }

  async appendSemrushRpaSnapshot(
    ctx: LlmJobContext,
    input: {
      content: string;
      targetKeyword: string;
      recommendedKeywords: string[];
      semrushResult: SeoScore;
      localResult: LocalSeoScoreResult;
      round?: number;
      kind?: 'semrush_check' | 'semrush_manual_check';
      rolledBack?: boolean;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const seoCheckData = this.mergeSemrushRpaSnapshot(prevCheck, input);
    if (seoCheckData === prevCheck) {
      return;
    }
    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: { seoCheckData: seoCheckData as object },
    });
  }

  async persistLocalSeoProgress(
    ctx: LlmJobContext,
    input: {
      localResult: LocalSeoScoreResult;
      optimizeRounds: number;
      content: string;
      passed: boolean;
      predictedSemrush?: number;
      gateMode?: 'legacy' | 'calibrated';
      existingSeoCheck: PersistedSeoCheckData;
      clearWorkflowProgress?: boolean;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as {
      optimizeHistory?: unknown[];
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
    };
    const reconciledImages = reconcileArticleImagesFromContent(
      input.content,
      draft.articleImages,
    ).filter((image) => !isPlaceholderImageUrl(image.url));
    const cleanedContent = stripPlaceholderMarkdownImages(input.content);
    const prevCheck = (job?.seoCheckData ?? input.existingSeoCheck ?? {}) as Record<string, unknown>;

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: input.clearWorkflowProgress
        ? null
        : (prevCheck.workflowProgress ?? null),
      local: {
        score: input.localResult.score,
        breakdown: input.localResult.breakdown,
        suggestions: input.localResult.suggestions,
        metrics: input.localResult.metrics,
        optimizeRounds: input.optimizeRounds,
        passed: input.passed,
        ...(input.predictedSemrush !== undefined
          ? { predictedSemrush: input.predictedSemrush }
          : {}),
        ...(input.gateMode ? { gateMode: input.gateMode } : {}),
      },
      optimizeHistory: draft.optimizeHistory ?? prevCheck.optimizeHistory ?? [],
    };

    const seoCheckData = appendSeoAnalysisSnapshot(
      seoCheckBase,
      buildLocalAnalysisSnapshot({
        content: input.content,
        targetKeyword: ctx.targetKeyword,
        localResult: input.localResult,
        round: input.optimizeRounds,
        includeFullContent: true,
      }),
    );

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: input.localResult.score,
        draftData: {
          ...draft,
          content: cleanedContent,
          articleImages: reconciledImages,
          imagesApplied:
            countEffectiveMarkdownImages(cleanedContent) >= SWA_MIN_IMAGES &&
            draft.imagesApplied === true,
        } as object,
        seoCheckData: seoCheckData as object,
      },
    });
  }

  async persistSemrushProgress(
    ctx: LlmJobContext,
    input: {
      localResult: LocalSeoScoreResult;
      /** 进入 Semrush 阶段时的本地评分快照；持久化展示分不再随正文改写变化 */
      frozenLocalResult?: LocalSeoScoreResult;
      semrushResult: SeoScore;
      localOptimizeRounds: number;
      semrushOptimizeRounds: number;
      content: string;
      existingSeoCheck: PersistedSeoCheckData;
      recommendedKeywords: string[];
      targetKeyword: string;
      localGatePassed?: boolean;
      localGateMode?: 'legacy' | 'calibrated';
      predictedSemrush?: number;
      /** 本轮真实 RPA 候选结果（回滚轮也记录候选稿分数） */
      rpaSnapshot?: {
        content: string;
        localResult: LocalSeoScoreResult;
        semrushResult: SeoScore;
        rolledBack?: boolean;
      };
      scoreConfig: ResolvedSiteSeoScoreConfig;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as {
      optimizeHistory?: unknown[];
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
    };
    const reconciledImages = reconcileArticleImagesFromContent(
      input.content,
      draft.articleImages,
    ).filter((image) => !isPlaceholderImageUrl(image.url));
    const cleanedContent = stripPlaceholderMarkdownImages(input.content);
    const prevCheck = (job?.seoCheckData ?? input.existingSeoCheck ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const frozenLocal = input.frozenLocalResult
      ? {
          score: input.frozenLocalResult.score,
          breakdown: input.frozenLocalResult.breakdown,
          suggestions: input.frozenLocalResult.suggestions,
          metrics: input.frozenLocalResult.metrics,
        }
      : resolveFrozenLocalScoreFields(prevCheck.local, input.localResult);

    const seoCheckBase = {
      ...prevCheck,
      workflowProgress: prevCheck.workflowProgress ?? null,
      scoreThresholds: buildScoreThresholdsSnapshot(input.scoreConfig),
      local: {
        score: frozenLocal.score,
        breakdown: frozenLocal.breakdown,
        suggestions: frozenLocal.suggestions,
        metrics: frozenLocal.metrics,
        optimizeRounds: input.localOptimizeRounds,
        passed:
          input.localGatePassed ??
          frozenLocal.score >= input.scoreConfig.localPassThreshold,
        ...(input.predictedSemrush !== undefined
          ? { predictedSemrush: input.predictedSemrush }
          : {}),
        ...(input.localGateMode ? { gateMode: input.localGateMode } : {}),
      },
      semrush: input.semrushResult.skipped
        ? { ...prevSemrush, skipped: true, suggestions: input.semrushResult.suggestions }
        : {
            ...prevSemrush,
            overall: input.semrushResult.overall,
            suggestions: input.semrushResult.suggestions,
            passed: input.semrushResult.overall >= input.scoreConfig.semrushPassThreshold,
            node: input.semrushResult.node,
            nodeLabel: input.semrushResult.nodeLabel,
            suggestionDetails: input.semrushResult.suggestionDetails,
            actionableIssues: input.semrushResult.actionableIssues,
            analysisSource: input.semrushResult.analysisSource,
            apiUrls: input.semrushResult.apiUrls,
            optimizeRounds: input.semrushOptimizeRounds,
            submittedKeywords: resolvePersistedSubmittedKeywords(
              input.content,
              input.targetKeyword,
              input.recommendedKeywords,
              input.semrushResult,
            ),
            semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
            semrushCurrentWordCount: input.semrushResult.semrushCurrentWordCount,
            semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
            semrushEvaluationRoute: input.semrushResult.semrushEvaluationRoute,
            semrushEvaluationContentFingerprint:
              input.semrushResult.semrushEvaluationContentFingerprint,
            semrushTargetKeywords: input.semrushResult.semrushTargetKeywords,
            semrushRecommendedKeywords: input.semrushResult.semrushRecommendedKeywords,
            semrushMissingTargetKeywords: input.semrushResult.semrushMissingTargetKeywords,
            semrushMissingRecommendedKeywords:
              input.semrushResult.semrushMissingRecommendedKeywords,
            semrushCheckRecord: input.semrushResult.semrushCheckRecord,
          },
      optimizeHistory: draft.optimizeHistory ?? prevCheck.optimizeHistory ?? [],
    };

    let seoCheckData: Record<string, unknown> = seoCheckBase;
    if (input.rpaSnapshot) {
      seoCheckData = this.mergeSemrushRpaSnapshot(seoCheckData, {
        content: input.rpaSnapshot.content,
        targetKeyword: input.targetKeyword,
        recommendedKeywords: input.recommendedKeywords,
        semrushResult: input.rpaSnapshot.semrushResult,
        localResult: input.rpaSnapshot.localResult,
        round: input.semrushOptimizeRounds,
        rolledBack: input.rpaSnapshot.rolledBack,
      });
    }

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: frozenLocal.score,
        semrushScore: input.semrushResult.skipped ? null : input.semrushResult.overall,
        draftData: {
          ...draft,
          content: cleanedContent,
          articleImages: reconciledImages,
          imagesApplied:
            countEffectiveMarkdownImages(cleanedContent) >= SWA_MIN_IMAGES &&
            draft.imagesApplied === true,
        } as object,
        seoCheckData: seoCheckData as object,
      },
    });
  }

  async touchWorkflowProgress(
    ctx: LlmJobContext,
    progress: Omit<WorkflowProgress, 'updatedAt'>,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        seoCheckData: {
          ...prevCheck,
          workflowProgress: {
            ...progress,
            updatedAt: new Date().toISOString(),
          } satisfies WorkflowProgress,
        } as object,
      },
    });
  }

  async finishManualSemrushCheck(
    ctx: LlmJobContext,
    message: string,
    cancelled: boolean,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { seoCheckData: true },
    });

    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const pending = prevSemrush.pending as SemrushCheckPending | undefined;
    const restoreStatus = (pending?.previousStatus ?? 'FAILED') as JobStatus;
    const { pending: _pending, manualCheckPreviousStatus: _prev, ...semrushRest } = prevSemrush;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        status: restoreStatus,
        errorMessage: restoreStatus === 'COMPLETED' ? null : message,
        seoCheckData: {
          ...prevCheck,
          workflowProgress: restoreStatus === 'COMPLETED' ? null : prevCheck.workflowProgress ?? null,
          semrush: {
            ...semrushRest,
            lastManualCheckError: message,
            lastManualCheckEndedAt: new Date().toISOString(),
            cancelled: cancelled || undefined,
          },
        } as object,
      },
    });

    this.logger.warn(cancelled ? 'Manual Semrush check cancelled' : 'Manual Semrush check failed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: cancelled ? 'seo_checker.manual_semrush_cancelled' : 'seo_checker.manual_semrush_failed',
      errorMessage: message,
      restoreStatus,
    });
  }

  async reconcileDraftEnrichments(ctx: LlmJobContext, content: string): Promise<string> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const draft = (job?.draftData ?? {}) as {
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };
    const reconciledImages = reconcileArticleImagesFromContent(
      content,
      draft.articleImages,
    );

    const merged = mergeDraftEnrichments({
      content,
      internalLinks: draft.internalLinks,
      articleImages: reconciledImages,
    });

    if (merged === content.trim()) {
      return content;
    }

    const missing = countMissingEnrichments({
      content,
      internalLinks: draft.internalLinks,
      articleImages: reconciledImages,
    });

    await this.llmService.revertDraftContent(ctx, merged);

    this.logger.info('Draft enrichments restored after optimize', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.enrichment_restored',
      missingLinks: missing.missingLinks,
      missingImages: missing.missingImages,
    });

    return merged;
  }
}
