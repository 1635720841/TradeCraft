/**
 * SEO 查分服务：本地 TF-IDF 前置校验 → 达标后 Semrush 终检。
 *
 * 边界：
 * - 不负责：初稿生成（LlmService）、工作流状态机（WorkflowService）
 *
 * 入口：
 * - SeoCheckerService
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { scoreLocalSeo, buildLocalScoreGapPlan, type LocalSeoScoreResult } from '@wm/shared-core';
import {
  type SeoScore,
  type SeoCheckInput,
} from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  LOCAL_SEO_NEAR_MISS_MARGIN,
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_PASS_THRESHOLD,
} from '../../constants/seo-score';
import { filterSemrushRecommendedKeywords } from '../../providers/semrush/semrush-keywords.util';
import {
  canResumeSemrushOptimization,
  countOptimizeRounds,
  hasOptimizeBaseline,
  meetsSemrushLocalGuard,
  resolveLocalOptimizeRoundCap,
  resolveSemrushOptimizeRoundCap,
  resolveSemrushRollbackReason,
  shouldSkipLocalOptimization,
  type SeoOptimizeHistoryEntry,
} from '../../utils/seo-pipeline.util';

interface WorkflowProgress {
  phase: 'local-scoring' | 'local' | 'semrush-check' | 'semrush';
  round?: number;
  maxRounds?: number;
  message: string;
  localScore?: number;
  semrushScore?: number;
  updatedAt: string;
}
import {
  isSemrushCheckStale,
  shouldRecoverOrphanOptimizing,
  type SemrushCheckPending,
} from '../../constants/semrush-check';
import type { LlmJobContext } from '../llm/llm.service';
import { LlmService } from '../llm/llm.service';
import { formatFocusDimensions } from '../llm/optimize-history-context.util';
import type { ArticleImageRecord } from '../illustration/article-image.util';
import {
  countMissingEnrichments,
  mergeDraftEnrichments,
} from '../illustration/draft-enrichment.util';
import type { InternalLinkRecord } from '../linking/link-match.util';
import { SemrushQueueService } from '../../services/semrush-queue.service';

interface SerpOrganicRow {
  title?: string;
  snippet?: string;
}

interface OptimizeHistoryEntry extends SeoOptimizeHistoryEntry {}

interface PersistedSeoCheckData {
  local?: {
    score?: number;
    passed?: boolean;
  };
  semrush?: {
    skipped?: boolean;
    passed?: boolean;
    overall?: number;
    suggestions?: string[];
    node?: string;
    nodeLabel?: string;
    suggestionDetails?: SeoScore['suggestionDetails'];
    analysisSource?: SeoScore['analysisSource'];
    apiUrls?: string[];
    semrushCompetitorWordCount?: number;
    semrushCurrentWordCount?: number;
    semrushReadabilityScore?: number;
    submittedKeywords?: string[];
  };
}

@Injectable()
export class SeoCheckerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly semrushQueue: SemrushQueueService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStaleSemrushChecks();
  }

  async runPostDraftPipeline(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        draftData: true,
        serpData: true,
        briefData: true,
        localSeoScore: true,
        semrushScore: true,
        seoCheckData: true,
      },
    });

    if (!job?.draftData) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿不存在，无法进行 SEO 评分');
    }

    const draftData = job.draftData as {
      content?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
    };
    const content = draftData.content ?? '';
    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as {
      outline?: { targetWordCount?: number };
    } | null;
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const optimizeHistory = draftData.optimizeHistory ?? [];
    const seoCheck = (job.seoCheckData ?? {}) as PersistedSeoCheckData;

    const localAlreadyPassed = shouldSkipLocalOptimization(job.localSeoScore, seoCheck);
    const semrushResumable = canResumeSemrushOptimization(
      job.semrushScore,
      seoCheck,
      optimizeHistory,
    );

    let currentContent = content;
    await this.touchWorkflowProgress(ctx, {
      phase: 'local-scoring',
      message: localAlreadyPassed
        ? `本地预检已通过（${job.localSeoScore ?? seoCheck.local?.score ?? '—'} 分），${semrushResumable ? '续跑 Semrush 优化…' : '进入 Semrush 终检…'}`
        : '正在计算本地预检分…',
    });
    let localResult = this.evaluateLocal(ctx.targetKeyword, currentContent, serpData, targetWordCount);
    let optimizeRounds = countOptimizeRounds(optimizeHistory, 'local');

    if (!localAlreadyPassed) {
      if (!hasOptimizeBaseline(optimizeHistory, 'local')) {
        await this.llmService.recordOptimizeSnapshot(ctx, {
          phase: 'local',
          round: 0,
          kind: 'baseline',
          scoreAfter: localResult.score,
          breakdownAfter: localResult.breakdown,
          optimizedAt: new Date().toISOString(),
        });
      }

      let bestLocalScore = localResult.score;
      let bestLocalContent = currentContent;
      let bestLocalResult = localResult;
      const isLocalResume = optimizeRounds > 0;
      const localRoundCap = resolveLocalOptimizeRoundCap(
        bestLocalScore,
        optimizeRounds,
        isLocalResume,
      );

      while (localResult.score < LOCAL_SEO_PASS_THRESHOLD && optimizeRounds < localRoundCap) {
      optimizeRounds += 1;
      const pointsToGo = LOCAL_SEO_PASS_THRESHOLD - localResult.score;
      await this.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: localRoundCap,
        localScore: localResult.score,
        message:
          pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN
            ? `本地预检 ${localResult.score} 分（差 ${pointsToGo} 分达标），按建议定向改写中（第 ${optimizeRounds}/${localRoundCap} 轮）…`
            : `本地预检 ${localResult.score} 分，AI 优化中（第 ${optimizeRounds}/${localRoundCap} 轮，目标 ≥${LOCAL_SEO_PASS_THRESHOLD}，约 1–3 分钟）…`,
      });
      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        job.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
      );
      this.logger.info('Local SEO below threshold, optimizing draft', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.local_optimize',
        round: optimizeRounds,
        score: localResult.score,
        recommendedKeywordCount: keywordsForAi.length,
      });

      const localOptCtx = this.buildLocalOptimizeContext(localResult, currentContent);
      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        localOptCtx.suggestions,
        keywordsForAi,
        {
          phase: 'local',
          round: optimizeRounds,
          scoreBefore: localResult.score,
          localScore: localResult.score,
          localScoreTarget: LOCAL_SEO_PASS_THRESHOLD,
          localScoreBreakdown: this.formatLocalScoreBreakdown(localResult),
          focusDimensions: formatFocusDimensions(localResult.breakdown),
          readabilityPriority: localOptCtx.readabilityPriority,
          readabilityAudit: localOptCtx.readabilityAudit,
          pointsToGo: localOptCtx.pointsToGo,
          scoreGapPlan: localOptCtx.scoreGapPlan,
        },
      );
      const candidateResult = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
      );
      const improved = candidateResult.score >= bestLocalScore;
      if (improved) {
        bestLocalScore = candidateResult.score;
        bestLocalContent = currentContent;
        bestLocalResult = candidateResult;
        localResult = candidateResult;
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          { scoreAfter: localResult.score, breakdownAfter: localResult.breakdown },
        );
      } else {
        await this.llmService.revertDraftContent(ctx, bestLocalContent);
        currentContent = bestLocalContent;
        localResult = bestLocalResult;
        this.logger.warn('Local optimize rolled back to best version', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.local_optimize_rollback',
          round: optimizeRounds,
          candidateScore: candidateResult.score,
          bestScore: bestLocalScore,
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          {
            scoreAfter: bestLocalScore,
            breakdownAfter: bestLocalResult.breakdown,
            rolledBack: true,
            candidateScoreAfter: candidateResult.score,
            rollbackReason: 'score_regressed',
          },
        );
      }
      await this.persistLocalSeoProgress(ctx, {
        localResult: bestLocalResult,
        optimizeRounds,
        content: bestLocalContent,
        passed: bestLocalScore >= LOCAL_SEO_PASS_THRESHOLD,
        existingSeoCheck: seoCheck,
      });
      }

      currentContent = bestLocalContent;
      localResult = bestLocalResult;
    } else {
      this.logger.info('Resuming SEO pipeline: local pre-check already passed', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.resume_local_skipped',
        localScore: job.localSeoScore ?? localResult.score,
      });
    }

    currentContent = await this.reconcileDraftEnrichments(ctx, currentContent);

    if (localResult.score < LOCAL_SEO_PASS_THRESHOLD) {
      await this.persistLocalSeoProgress(ctx, {
        localResult,
        optimizeRounds,
        content: currentContent,
        passed: false,
        existingSeoCheck: seoCheck,
        clearWorkflowProgress: true,
      });
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `本地 SEO 评分 ${localResult.score} 分，未达 ${LOCAL_SEO_PASS_THRESHOLD} 分门槛：${localResult.suggestions.join('；')}`,
      );
    }

    const recommendedKeywords = this.mergeRecommendedKeywordsForWriting(
      job.briefData,
      localResult.recommendedKeywords,
      ctx.targetKeyword,
    );

    await this.touchWorkflowProgress(ctx, {
      phase: 'semrush-check',
      localScore: localResult.score,
      message: semrushResumable
        ? `续跑 Semrush 优化（当前 ${job.semrushScore}/10，目标 ≥${SEMRUSH_PASS_THRESHOLD}）…`
        : `本地预检 ${localResult.score} 分已通过，Semrush 终检中（3ue RPA，约 2–5 分钟）…`,
    });

    let semrushResult: SeoScore;
    if (semrushResumable) {
      semrushResult = this.restoreSemrushResult(seoCheck.semrush!, job.semrushScore!);
      this.logger.info('Resuming SEO pipeline: Semrush optimization from last checkpoint', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.resume_semrush',
        semrushScore: job.semrushScore,
        priorOptimizeRounds: countOptimizeRounds(optimizeHistory, 'semrush'),
      });
    } else {
      semrushResult = await this.runSemrushCheck(
        {
          content: currentContent,
          keyword: ctx.targetKeyword,
          recommendedKeywords,
        },
        ctx,
      );

      if (!semrushResult.skipped && !hasOptimizeBaseline(optimizeHistory, 'semrush')) {
        await this.llmService.recordOptimizeSnapshot(ctx, {
          phase: 'semrush',
          round: 0,
          kind: 'baseline',
          scoreAfter: semrushResult.overall,
          localScoreAfter: localResult.score,
          optimizedAt: new Date().toISOString(),
        });
      }
    }

    let semrushOptimizeRounds = countOptimizeRounds(optimizeHistory, 'semrush');
    let bestSemrushScore = semrushResult.overall;
    const isSemrushResume = semrushResumable && semrushOptimizeRounds > 0;
    const semrushRoundCap = resolveSemrushOptimizeRoundCap(
      bestSemrushScore,
      semrushOptimizeRounds,
      isSemrushResume,
    );
    let bestSemrushContent = currentContent;
    let bestSemrushResult = semrushResult;
    let bestLocalAtSemrush = localResult;

    while (
      !semrushResult.skipped &&
      semrushResult.overall < SEMRUSH_PASS_THRESHOLD &&
      semrushOptimizeRounds < semrushRoundCap
    ) {
      const rewriteSuggestions = this.buildRewriteSuggestions(semrushResult);
      if (rewriteSuggestions.length === 0) break;

      semrushOptimizeRounds += 1;
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: localResult.score,
        semrushScore: semrushResult.overall,
        message: `Semrush ${semrushResult.overall}/10，AI 按侧栏建议优化（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`,
      });
      this.logger.info('Semrush below threshold, rewriting draft with suggestions', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.semrush_optimize',
        round: semrushOptimizeRounds,
        score: semrushResult.overall,
        suggestionCount: rewriteSuggestions.length,
      });

      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        job.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
      );
      const semrushLocalOptCtx = this.buildLocalOptimizeContext(localResult, currentContent);
      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        rewriteSuggestions,
        keywordsForAi,
        {
          phase: 'semrush',
          round: semrushOptimizeRounds,
          scoreBefore: semrushResult.overall,
          semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
          semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
          semrushReadabilityScore: semrushResult.semrushReadabilityScore,
          localScore: localResult.score,
          localScoreTarget: LOCAL_SEO_PASS_THRESHOLD,
          localScoreBreakdown: this.formatLocalScoreBreakdown(localResult),
          focusDimensions: formatFocusDimensions(localResult.breakdown),
          readabilityPriority: semrushLocalOptCtx.readabilityPriority,
          readabilityAudit: semrushLocalOptCtx.readabilityAudit,
          pointsToGo: semrushLocalOptCtx.pointsToGo,
          scoreGapPlan: semrushLocalOptCtx.scoreGapPlan,
        },
      );
      const candidateLocal = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
      );
      const semrushKeywords = this.mergeRecommendedKeywordsForWriting(
        job.briefData,
        candidateLocal.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
      );
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush-check',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: candidateLocal.score,
        semrushScore: semrushResult.overall,
        message: `第 ${semrushOptimizeRounds} 轮优化完成，重新 Semrush 终检中…`,
      });
      const candidateSemrush = await this.runSemrushCheck(
        {
          content: currentContent,
          keyword: ctx.targetKeyword,
          recommendedKeywords: semrushKeywords,
        },
        ctx,
      );
      const semrushImproved = candidateSemrush.overall >= bestSemrushScore;
      const semrushPassing = candidateSemrush.overall >= SEMRUSH_PASS_THRESHOLD;
      const localGuard = meetsSemrushLocalGuard(
        candidateLocal.score,
        bestLocalAtSemrush.score,
        semrushImproved,
        semrushPassing,
      );
      if ((semrushImproved && localGuard) || semrushPassing) {
        bestSemrushScore = candidateSemrush.overall;
        bestSemrushContent = currentContent;
        bestSemrushResult = candidateSemrush;
        bestLocalAtSemrush = candidateLocal;
        semrushResult = candidateSemrush;
        localResult = candidateLocal;
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'semrush', round: semrushOptimizeRounds },
          {
            scoreAfter: semrushResult.overall,
            localScoreAfter: localResult.score,
          },
        );
      } else {
        await this.llmService.revertDraftContent(ctx, bestSemrushContent);
        currentContent = bestSemrushContent;
        semrushResult = bestSemrushResult;
        localResult = bestLocalAtSemrush;
        this.logger.warn('Semrush optimize rolled back to best version', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.semrush_optimize_rollback',
          round: semrushOptimizeRounds,
          candidateSemrush: candidateSemrush.overall,
          candidateLocal: candidateLocal.score,
          bestSemrush: bestSemrushScore,
          bestLocal: bestLocalAtSemrush.score,
        });
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'semrush', round: semrushOptimizeRounds },
          {
            scoreAfter: bestSemrushScore,
            localScoreAfter: bestLocalAtSemrush.score,
            rolledBack: true,
            candidateScoreAfter: candidateSemrush.overall,
            candidateLocalScoreAfter: candidateLocal.score,
            rollbackReason: resolveSemrushRollbackReason(
              semrushImproved,
              localGuard,
            ),
          },
        );
      }
      await this.persistSemrushProgress(ctx, {
        localResult: bestLocalAtSemrush,
        semrushResult: bestSemrushResult,
        localOptimizeRounds: optimizeRounds,
        semrushOptimizeRounds,
        content: bestSemrushContent,
        existingSeoCheck: seoCheck,
        recommendedKeywords,
        targetKeyword: ctx.targetKeyword,
      });
    }

    currentContent = bestSemrushContent;
    localResult = bestLocalAtSemrush;
    semrushResult = bestSemrushResult;

    currentContent = await this.reconcileDraftEnrichments(ctx, currentContent);

    const latestJob = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const latestDraft = (latestJob?.draftData ?? draftData) as {
      content?: string;
      optimizeHistory?: unknown[];
    };

    const seoCheckData = {
      workflowProgress: null,
      local: {
        score: localResult.score,
        breakdown: localResult.breakdown,
        suggestions: localResult.suggestions,
        metrics: localResult.metrics,
        optimizeRounds,
        passed: localResult.score >= LOCAL_SEO_PASS_THRESHOLD,
        passedAt: new Date().toISOString(),
      },
      semrush: semrushResult.skipped
        ? { skipped: true, suggestions: semrushResult.suggestions }
        : {
            overall: semrushResult.overall,
            suggestions: semrushResult.suggestions,
            passed: semrushResult.overall >= SEMRUSH_PASS_THRESHOLD,
            node: semrushResult.node,
            nodeLabel: semrushResult.nodeLabel,
            suggestionDetails: semrushResult.suggestionDetails,
            analysisSource: semrushResult.analysisSource,
            apiUrls: semrushResult.apiUrls,
            optimizeRounds: semrushOptimizeRounds,
            submittedKeywords: [ctx.targetKeyword, ...recommendedKeywords],
            semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
            semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
            semrushReadabilityScore: semrushResult.semrushReadabilityScore,
          },
      optimizeHistory: latestDraft.optimizeHistory ?? [],
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: localResult.score,
        seoCheckData: seoCheckData as object,
        semrushScore: semrushResult.skipped ? null : semrushResult.overall,
        draftData: { ...latestDraft, content: currentContent } as object,
      },
    });

    if (!semrushResult.skipped && semrushResult.overall < SEMRUSH_PASS_THRESHOLD) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `Semrush 评分 ${semrushResult.overall}，未达 ${SEMRUSH_PASS_THRESHOLD} 分：${semrushResult.suggestions.join('；')}`,
      );
    }

    this.logger.info('SEO check pipeline completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.completed',
      localScore: localResult.score,
      semrushScore: semrushResult.skipped ? null : semrushResult.overall,
      optimizeRounds,
      semrushOptimizeRounds,
    });
  }

  /** Brief 推荐实体词 + 本地评分缺失 SERP 词，供 LLM 写入与 Semrush 提交 */
  private async reconcileDraftEnrichments(ctx: LlmJobContext, content: string): Promise<string> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const draft = (job?.draftData ?? {}) as {
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };

    const merged = mergeDraftEnrichments({
      content,
      internalLinks: draft.internalLinks,
      articleImages: draft.articleImages,
    });

    if (merged === content.trim()) {
      return content;
    }

    const missing = countMissingEnrichments({
      content,
      internalLinks: draft.internalLinks,
      articleImages: draft.articleImages,
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

  /** Brief 推荐实体词 + 本地评分缺失 SERP 词，供 LLM 写入与 Semrush 提交 */
  private mergeRecommendedKeywordsForWriting(
    briefData: unknown,
    localRecommendedKeywords: string[],
    targetKeyword: string,
    semrushRecommendedKeywords?: string[],
  ): string[] {
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

  /** 合并 Semrush 扁平建议与分类建议，供 LLM 改写（含可读性/语气/原创性） */
  private buildRewriteSuggestions(result: SeoScore): string[] {
    const lines: string[] = [];
    const details = result.suggestionDetails;

    const pushSection = (label: string, items?: string[]) => {
      for (const item of items ?? []) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        lines.push(trimmed.startsWith('[') ? trimmed : `[${label}] ${trimmed}`);
      }
    };

    pushSection('可读性', details?.readability);
    pushSection('SEO', details?.seo);
    pushSection('语气', details?.tone);
    pushSection('原创性', details?.originality);

    for (const item of result.suggestions) {
      const trimmed = item.trim();
      if (trimmed) lines.push(trimmed);
    }

    if (lines.length === 0) {
      lines.push(
        '[语气] 减少模板化与 AI 套话，使表达更自然',
        '[原创性] 补充具体案例或独特观点，避免与竞品同质表述',
        '[可读性] 拆分长段、简化句式、使用主动语态',
      );
    }

    const competitorWords = result.semrushCompetitorWordCount;
    const currentWords = result.semrushCurrentWordCount;
    if (
      typeof competitorWords === 'number' &&
      typeof currentWords === 'number' &&
      currentWords > competitorWords + 30
    ) {
      lines.unshift(
        `[可读性] 当前约 ${currentWords} 词，Semrush 竞品标杆约 ${competitorWords} 词：须删减至 ${competitorWords}–${competitorWords + 50} 词，删重复论述与过渡句，保留各 H2 一句核心观点`,
      );
    }

    const readability = result.semrushReadabilityScore;
    if (typeof readability === 'number' && readability < 70) {
      lines.unshift(
        `[可读性] Semrush 可读性指数 ${readability}/100（须 ≥70）：全文降复杂度——短句、简单词、主动语态、列表替长段`,
      );
    }

    return [...new Set(lines)].slice(0, 24);
  }

  /** 采纳重写后刷新本地 SEO 评分（不写回正文） */
  async refreshLocalSeoScore(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, serpData: true, briefData: true, seoCheckData: true },
    });

    if (!job?.draftData) {
      return;
    }

    const content = (job.draftData as { content?: string }).content?.trim();
    if (!content) {
      return;
    }

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    const localResult = this.evaluateLocal(
      ctx.targetKeyword,
      content,
      serpData,
      briefData?.outline?.targetWordCount ?? 1500,
    );

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: localResult.score,
        seoCheckData: {
          ...prevCheck,
          local: {
            score: localResult.score,
            breakdown: localResult.breakdown,
            suggestions: localResult.suggestions,
            metrics: localResult.metrics,
            passed: localResult.score >= LOCAL_SEO_PASS_THRESHOLD,
            refreshedAt: new Date().toISOString(),
          },
        } as object,
      },
    });
  }

  /** 手动触发：本地预检达标（≥95）后才跑 Semrush RPA 终检 */
  async runManualSemrushCheck(ctx: LlmJobContext): Promise<void> {
    if (process.env.SEMRUSH_ENABLED !== 'true') {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'Semrush 未启用，请在 apps/platform/api/.env 设置 SEMRUSH_ENABLED=true',
      );
    }

    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, serpData: true, briefData: true, seoCheckData: true, status: true },
    });

    if (!job?.draftData) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿不存在，无法检测');
    }

    const draftData = job.draftData as {
      content?: string;
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };
    const content = draftData.content?.trim();
    if (!content) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法检测');
    }

    const reconciledContent = await this.reconcileDraftEnrichments(ctx, content);

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    const localResult = this.evaluateLocal(
      ctx.targetKeyword,
      reconciledContent,
      serpData,
      briefData?.outline?.targetWordCount ?? 1500,
    );

    if (localResult.score < LOCAL_SEO_PASS_THRESHOLD) {
      const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
      await this.prisma.articleJob.update({
        where: { id: ctx.jobId },
        data: {
          localSeoScore: localResult.score,
          seoCheckData: {
            ...prevCheck,
            local: {
              score: localResult.score,
              breakdown: localResult.breakdown,
              suggestions: localResult.suggestions,
              metrics: localResult.metrics,
              passed: false,
              refreshedAt: new Date().toISOString(),
            },
          } as object,
        },
      });
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `本地预检 ${localResult.score} 分，未达 ${LOCAL_SEO_PASS_THRESHOLD} 分门槛，须先优化后再 Semrush 终检：${localResult.suggestions.join('；')}`,
      );
    }

    const recommendedKeywords = this.mergeRecommendedKeywordsForWriting(
      job.briefData,
      localResult.recommendedKeywords,
      ctx.targetKeyword,
    );

    const semrushResult = await this.runSemrushCheck(
      {
        content: reconciledContent,
        keyword: ctx.targetKeyword,
        recommendedKeywords,
      },
      ctx,
    );

    if (semrushResult.skipped) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        semrushResult.suggestions[0] ?? 'Semrush 查分已跳过',
      );
    }

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const { pending: _pending, ...semrushRest } = prevSemrush;

    const seoCheckData = {
      ...prevCheck,
      local: {
        score: localResult.score,
        breakdown: localResult.breakdown,
        suggestions: localResult.suggestions,
        metrics: localResult.metrics,
        passed: true,
        refreshedAt: new Date().toISOString(),
      },
      semrush: {
        ...semrushRest,
        overall: semrushResult.overall,
        suggestions: semrushResult.suggestions,
        passed: semrushResult.overall >= SEMRUSH_PASS_THRESHOLD,
        node: semrushResult.node,
        nodeLabel: semrushResult.nodeLabel,
        suggestionDetails: semrushResult.suggestionDetails,
        analysisSource: semrushResult.analysisSource,
        apiUrls: semrushResult.apiUrls,
        manualCheckAt: new Date().toISOString(),
        submittedKeywords: [ctx.targetKeyword, ...recommendedKeywords],
        semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
        semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
        semrushReadabilityScore: semrushResult.semrushReadabilityScore,
      },
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        status: 'COMPLETED',
        errorMessage: null,
        localSeoScore: localResult.score,
        semrushScore: semrushResult.overall,
        seoCheckData: seoCheckData as object,
        draftData: { ...draftData, content: reconciledContent } as object,
      },
    });

    this.logger.info('Manual Semrush check completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.manual_semrush',
      localScore: localResult.score,
      semrushScore: semrushResult.overall,
    });
  }

  async markManualSemrushFailed(
    ctx: LlmJobContext,
    errorMessage: string,
  ): Promise<void> {
    await this.finishManualSemrushCheck(ctx, errorMessage, false);
  }

  async cancelManualSemrushCheck(ctx: LlmJobContext, reason: string): Promise<void> {
    await this.finishManualSemrushCheck(ctx, reason, true);
  }

  async recoverStaleSemrushChecks(): Promise<void> {
    const jobs = await this.prisma.articleJob.findMany({
      where: { status: 'OPTIMIZING' },
      select: {
        id: true,
        traceId: true,
        organizationId: true,
        projectId: true,
        status: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    for (const job of jobs) {
      const pending = this.getSemrushPending(job.seoCheckData);
      const ctx = {
        jobId: job.id,
        traceId: job.traceId,
        organizationId: job.organizationId,
        projectId: job.projectId,
        targetKeyword: '',
      };

      if (pending && isSemrushCheckStale(pending.startedAt)) {
        await this.cancelManualSemrushCheck(
          ctx,
          'Semrush 检测超时，已自动取消（可重新检测）',
        );
        continue;
      }

      if (shouldRecoverOrphanOptimizing(job)) {
        await this.recoverOrphanOptimizingJob(
          ctx,
          '检测到僵死的优化状态，已自动恢复（可重新检测）',
        );
      }
    }
  }

  /** OPTIMIZING 且无 pending：工作流中断或失败后状态未回写 */
  async recoverOrphanOptimizingJob(
    ctx: LlmJobContext,
    reason: string,
  ): Promise<JobStatus> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        status: true,
        seoCheckData: true,
        localSeoScore: true,
        semrushScore: true,
      },
    });

    if (!job || job.status !== 'OPTIMIZING') {
      return (job?.status ?? 'FAILED') as JobStatus;
    }

    const restoreStatus: JobStatus =
      job.localSeoScore != null || job.semrushScore != null ? 'COMPLETED' : 'FAILED';

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const { pending: _pending, ...semrushRest } = prevSemrush;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        status: restoreStatus,
        errorMessage: reason,
        seoCheckData: {
          ...prevCheck,
          semrush: {
            ...semrushRest,
            lastManualCheckError: reason,
            lastManualCheckEndedAt: new Date().toISOString(),
            recoveredOrphanOptimizing: true,
          },
        } as object,
      },
    });

    this.logger.warn('Recovered orphan OPTIMIZING job', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.orphan_optimizing_recovered',
      restoreStatus,
      reason,
    });

    return restoreStatus;
  }

  /** 本地预检进度写入 DB（优化中/失败时供前端展示缺口与可读性计数） */
  private async persistLocalSeoProgress(
    ctx: LlmJobContext,
    input: {
      localResult: LocalSeoScoreResult;
      optimizeRounds: number;
      content: string;
      passed: boolean;
      existingSeoCheck: PersistedSeoCheckData;
      clearWorkflowProgress?: boolean;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as { optimizeHistory?: unknown[] };
    const prevCheck = (job?.seoCheckData ?? input.existingSeoCheck ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: input.localResult.score,
        draftData: { ...draft, content: input.content } as object,
        seoCheckData: {
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
          },
          optimizeHistory: draft.optimizeHistory ?? prevCheck.optimizeHistory ?? [],
        } as object,
      },
    });
  }

  /** Semrush 优化进度写入 DB（每轮结束后供前端展示最新分数） */
  private async persistSemrushProgress(
    ctx: LlmJobContext,
    input: {
      localResult: LocalSeoScoreResult;
      semrushResult: SeoScore;
      localOptimizeRounds: number;
      semrushOptimizeRounds: number;
      content: string;
      existingSeoCheck: PersistedSeoCheckData;
      recommendedKeywords: string[];
      targetKeyword: string;
    },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as { optimizeHistory?: unknown[] };
    const prevCheck = (job?.seoCheckData ?? input.existingSeoCheck ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: input.localResult.score,
        semrushScore: input.semrushResult.skipped ? null : input.semrushResult.overall,
        draftData: { ...draft, content: input.content } as object,
        seoCheckData: {
          ...prevCheck,
          workflowProgress: prevCheck.workflowProgress ?? null,
          local: {
            score: input.localResult.score,
            breakdown: input.localResult.breakdown,
            suggestions: input.localResult.suggestions,
            metrics: input.localResult.metrics,
            optimizeRounds: input.localOptimizeRounds,
            passed: input.localResult.score >= LOCAL_SEO_PASS_THRESHOLD,
          },
          semrush: input.semrushResult.skipped
            ? { skipped: true, suggestions: input.semrushResult.suggestions }
            : {
                overall: input.semrushResult.overall,
                suggestions: input.semrushResult.suggestions,
                passed: input.semrushResult.overall >= SEMRUSH_PASS_THRESHOLD,
                node: input.semrushResult.node,
                nodeLabel: input.semrushResult.nodeLabel,
                suggestionDetails: input.semrushResult.suggestionDetails,
                analysisSource: input.semrushResult.analysisSource,
                apiUrls: input.semrushResult.apiUrls,
                optimizeRounds: input.semrushOptimizeRounds,
                submittedKeywords: [input.targetKeyword, ...input.recommendedKeywords],
                semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
                semrushCurrentWordCount: input.semrushResult.semrushCurrentWordCount,
                semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
              },
          optimizeHistory: draft.optimizeHistory ?? prevCheck.optimizeHistory ?? [],
        } as object,
      },
    });
  }

  private getSemrushPending(seoCheckData: unknown): SemrushCheckPending | null {
    const data = (seoCheckData ?? {}) as { semrush?: { pending?: SemrushCheckPending } };
    return data.semrush?.pending ?? null;
  }

  /** 工作流优化阶段心跳，供前端展示进度并判断是否僵死 */
  private async touchWorkflowProgress(
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

  private async finishManualSemrushCheck(
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
    const restoreStatus = (pending?.previousStatus ?? 'COMPLETED') as JobStatus;
    const { pending: _pending, ...semrushRest } = prevSemrush;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        status: restoreStatus,
        errorMessage: message,
        seoCheckData: {
          ...prevCheck,
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

  private buildLocalOptimizeContext(
    localResult: LocalSeoScoreResult,
    content: string,
  ): {
    suggestions: string[];
    readabilityPriority: boolean;
    readabilityAudit?: string;
    pointsToGo?: number;
    scoreGapPlan: string;
  } {
    const pointsToGo = Math.max(0, LOCAL_SEO_PASS_THRESHOLD - localResult.score);
    const readabilityGap = 20 - localResult.breakdown.readability;
    const nearMiss = pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN;
    const m = localResult.metrics;
    const readabilityPriority =
      nearMiss &&
      (pointsToGo <= 2 ||
        readabilityGap >= 2 ||
        m.longSentencesOver22 > 2 ||
        m.longParagraphsOver80 > 1 ||
        m.passiveVoiceHits > 6);
    const suggestions = [...localResult.suggestions];
    const audit = this.auditReadability(content, m);
    const scoreGapPlan = buildLocalScoreGapPlan(localResult, LOCAL_SEO_PASS_THRESHOLD);

    if (readabilityPriority || pointsToGo <= 2) {
      if (m.longSentencesOver22 > 2) {
        suggestions.unshift(
          `[可读性·必做] 将超长句从 ${m.longSentencesOver22} 条压到 ≤2 条（评分器按 >22 词计数，不是 25 词）`,
        );
      }
      if (m.longParagraphsOver80 > 1) {
        suggestions.unshift(
          `[可读性·必做] 将超长段从 ${m.longParagraphsOver80} 段压到 ≤1 段（>80 词/段）`,
        );
      }
      if (m.passiveVoiceHits > 6) {
        suggestions.unshift(
          `[可读性] 被动语态 ${m.passiveVoiceHits} 处，须减至 ≤6 处（可 +4 可读性分）`,
        );
      }
    }

    if (pointsToGo === 1) {
      suggestions.unshift(
        '[+1 分模式] 只做 1 处最小改动：拆 1 条长句到 ≤22 词，或删 1 处被动，或补 1 个列表；禁止加新段落或 SERP 凑句',
      );
    }

    return {
      suggestions,
      readabilityPriority,
      pointsToGo: pointsToGo > 0 ? pointsToGo : undefined,
      readabilityAudit: readabilityPriority || pointsToGo <= 2 ? audit.promptText : undefined,
      scoreGapPlan,
    };
  }

  private auditReadability(
    content: string,
    metrics?: LocalSeoScoreResult['metrics'],
  ): {
    longSentenceCount: number;
    longParagraphCount: number;
    promptText: string;
  } {
    const countWords = (text: string) =>
      text.trim().split(/\s+/).filter(Boolean).length;

    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => countWords(s) >= 4);
    const longSentences = sentences.filter((s) => countWords(s) > 22);

    const bodyParagraphs = content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(
        (p) => p.length > 0 && !p.startsWith('#') && !p.startsWith('![') && !/^-\s+/.test(p),
      );
    const longParagraphs = bodyParagraphs.filter((p) => countWords(p) > 80);

    const longSentenceCount = metrics?.longSentencesOver22 ?? longSentences.length;
    const longParagraphCount = metrics?.longParagraphsOver80 ?? longParagraphs.length;

    const samples = longSentences
      .slice(0, 5)
      .map((s) => `• "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}" (${countWords(s)} words)`);

    const lines = [
      `Scorer counts: ${longSentenceCount} sentences >22 words (need ≤2), ${longParagraphCount} paragraphs >80 words (need ≤1).`,
    ];
    if (samples.length > 0) {
      lines.push('Split EVERY sentence below to ≤22 words (keep facts, split clauses):', ...samples);
    }

    return {
      longSentenceCount,
      longParagraphCount,
      promptText: lines.join('\n'),
    };
  }

  private restoreSemrushResult(
    semrush: NonNullable<PersistedSeoCheckData['semrush']>,
    overall: number,
  ): SeoScore {
    return {
      overall,
      suggestions: semrush.suggestions ?? [],
      node: semrush.node,
      nodeLabel: semrush.nodeLabel,
      suggestionDetails: semrush.suggestionDetails,
      analysisSource: semrush.analysisSource,
      apiUrls: semrush.apiUrls,
      semrushCompetitorWordCount: semrush.semrushCompetitorWordCount,
      semrushCurrentWordCount: semrush.semrushCurrentWordCount,
      semrushReadabilityScore: semrush.semrushReadabilityScore,
    };
  }

  private runSemrushCheck(input: SeoCheckInput, ctx: LlmJobContext): Promise<SeoScore> {
    return this.semrushQueue.runCheck(input, {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
    });
  }

  private evaluateLocal(
    keyword: string,
    content: string,
    serpData: { organic?: SerpOrganicRow[] } | null,
    targetWordCount: number,
  ): LocalSeoScoreResult {
    return scoreLocalSeo({
      keyword,
      content,
      serpOrganic: serpData?.organic,
      targetWordCount,
    });
  }

  private formatLocalScoreBreakdown(result: LocalSeoScoreResult): string {
    const b = result.breakdown;
    const lines = [
      `当前总分 ${result.score}/100`,
      `- 关键词 ${b.keywordCoverage}/25（开篇含词 + 密度 0.8–2.5% + H2 含关键词）`,
      `- SERP 词 ${b.serpTermAlignment}/25（已对齐 ${result.metrics.matchedSerpTerms}/${result.metrics.totalSerpTerms}）`,
      `- 结构 ${b.structure}/20（H2≥4 + 篇幅 70–105% + 列表）`,
      `- 可读性 ${b.readability}/20（短段短句、少被动）`,
      `- 深度 ${b.contentDepth}/10（≥700 词 + 术语丰富）`,
    ];
    if (result.recommendedKeywords.length > 0) {
      lines.push(`- 尚未覆盖的 SERP 词（须原词写入）：${result.recommendedKeywords.slice(0, 12).join('、')}`);
    }
    return lines.join('\n');
  }
}
