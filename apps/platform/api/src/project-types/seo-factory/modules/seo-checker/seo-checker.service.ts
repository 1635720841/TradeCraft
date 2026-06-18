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
import { scoreLocalSeo, buildLocalScoreGapPlan, boostLocalSeoContent, LOCAL_PARAGRAPH_MAX_WORDS, validateAndFixSemrushStructure, detectSemrushStructureErrors, type LocalSeoScoreResult } from '@wm/shared-core';
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
  resolveLocalOptimizeRoundCap,
  resolveSemrushOptimizeRoundCap,
  shouldAcceptSemrushCandidate,
  shouldAcceptLocalCandidate,
  shouldSkipLocalOptimization,
  shouldSkipLocalPipeline,
  type SeoOptimizeHistoryEntry,
} from '../../utils/seo-pipeline.util';
import {
  buildSemrushBoostOptions,
  buildSemrushOptimizeContext,
  buildSemrushReadabilityAudit,
  buildFallbackSemrushSuggestions,
  buildSemrushRewriteSuggestions,
  resolveSemrushBoostWordTarget,
} from '../../utils/semrush-optimize.util';
import {
  applySemrushNearMissDeterministicFixes,
  applySemrushSidebarComplexWordFixes,
  buildSemrushNearMissSurgicalInstruction,
  isSemrushUltraNearMiss,
} from '../../utils/semrush-near-miss.util';
import {
  collectPresentSeoPhrases,
  findMissingSemrushKeywords,
  mergeSemrushKeywordLists,
} from '../../providers/semrush/semrush-keyword-coverage.util';
import {
  buildSemrushCheckInputFromContent,
  buildSemrushSubmittedKeywords,
} from '../../providers/semrush/semrush-submitted-keywords.util';
import type { GenerateOptimizeMeta, LlmJobContext } from '../llm/llm.service';
import { LlmService } from '../llm/llm.service';

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
import { withWorkflowMeta } from '../../constants/workflow-resume';
import { resolveOrphanOptimizingRestore } from '../../utils/semrush-orphan-restore.util';
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
  optimizationRerun?: {
    reason?: 'gsc_underperform' | 'manual';
    requestedAt?: string;
  };
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
    actionableIssues?: SeoScore['actionableIssues'];
    analysisSource?: SeoScore['analysisSource'];
    apiUrls?: string[];
    semrushCompetitorWordCount?: number;
    semrushCurrentWordCount?: number;
    semrushReadabilityScore?: number;
    semrushEvaluationRoute?: string;
    semrushEvaluationContentFingerprint?: string;
    semrushTargetKeywords?: string[];
    semrushRecommendedKeywords?: string[];
    semrushMissingTargetKeywords?: string[];
    semrushMissingRecommendedKeywords?: string[];
    submittedKeywords?: string[];
  };
}

const GSC_UNDERPERFORM_OPTIMIZE_HINTS = [
  '搜索表现偏弱：强化开篇与标题一致性，首段直接回答搜索意图',
  '对照竞品补充高价值信息点，提升点击动机与页面深度',
];

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

    const forceRerun = Boolean(seoCheck.optimizationRerun?.requestedAt);
    const localAlreadyPassed =
      !forceRerun && shouldSkipLocalOptimization(job.localSeoScore, seoCheck);
    let semrushResumable = canResumeSemrushOptimization(
      job.semrushScore,
      seoCheck,
      optimizeHistory,
    );
    if (
      forceRerun &&
      !semrushResumable &&
      job.semrushScore != null &&
      job.semrushScore < SEMRUSH_PASS_THRESHOLD &&
      hasOptimizeBaseline(optimizeHistory, 'semrush')
    ) {
      semrushResumable = true;
    }
    const skipLocalPipeline = shouldSkipLocalPipeline(localAlreadyPassed, semrushResumable);

    let currentContent = content;
    await this.touchWorkflowProgress(ctx, {
      phase: 'local-scoring',
      message: forceRerun
        ? '搜索表现偏弱，重新优化评分中…'
        : skipLocalPipeline
          ? semrushResumable
            ? `续跑 Semrush 优化（当前 ${job.semrushScore}/10，目标 ≥${SEMRUSH_PASS_THRESHOLD}，本地分仅参考）…`
            : `本地预检已通过（${job.localSeoScore ?? seoCheck.local?.score ?? '—'} 分），进入 Semrush 终检…`
          : '正在计算本地预检分…',
    });
    let localResult = this.evaluateLocal(ctx.targetKeyword, currentContent, serpData, targetWordCount);
    let optimizeRounds = countOptimizeRounds(optimizeHistory, 'local');

    if (!skipLocalPipeline) {
      const initialBoost = this.applyDeterministicLocalBoost(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
        localResult.score,
      );
      if (initialBoost.applied) {
        currentContent = initialBoost.content;
        localResult = initialBoost.result;
        this.logger.info('Deterministic local SEO boost applied before optimize loop', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.local_deterministic_boost',
          scoreAfter: localResult.score,
        });
      }
    }

    if (!skipLocalPipeline) {
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
          contentCoverageMaxed: localOptCtx.contentCoverageMaxed,
          protectedSeoPhrases: this.collectProtectedSeoPhrases(
            currentContent,
            ctx.targetKeyword,
            keywordsForAi,
          ),
        },
      );
      currentContent = boostLocalSeoContent(currentContent, { targetWordCount });
      const candidateResult = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
      );
      const nearMiss = bestLocalScore >= LOCAL_SEO_PASS_THRESHOLD - LOCAL_SEO_NEAR_MISS_MARGIN;
      const longSentencesImproved =
        candidateResult.metrics.longSentencesOver22 <= 2 &&
        candidateResult.metrics.longSentencesOver22 <
          (bestLocalResult.metrics.longSentencesOver22 ?? Number.MAX_SAFE_INTEGER);
      const longParagraphsImproved =
        candidateResult.metrics.longParagraphsOver65 <= 1 &&
        candidateResult.metrics.longParagraphsOver65 <
          (bestLocalResult.metrics.longParagraphsOver65 ?? Number.MAX_SAFE_INTEGER);
      const readabilityImproved = longSentencesImproved || longParagraphsImproved;
      const improved = shouldAcceptLocalCandidate({
        candidateScore: candidateResult.score,
        bestScore: bestLocalScore,
        candidateKeywordCoverage: candidateResult.breakdown.keywordCoverage,
        bestKeywordCoverage: bestLocalResult.breakdown.keywordCoverage,
        nearMiss,
        readabilityImproved,
      });
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
            rollbackReason:
              candidateResult.breakdown.keywordCoverage <
              bestLocalResult.breakdown.keywordCoverage
                ? 'keyword_coverage_regressed'
                : 'score_regressed',
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

      const finalBoost = this.applyDeterministicLocalBoost(
        ctx.targetKeyword,
        bestLocalContent,
        serpData,
        targetWordCount,
        bestLocalScore,
      );
      if (finalBoost.applied && finalBoost.result.score >= bestLocalScore) {
        bestLocalContent = finalBoost.content;
        bestLocalResult = finalBoost.result;
        bestLocalScore = finalBoost.result.score;
        localResult = finalBoost.result;
        this.logger.info('Deterministic local SEO boost applied after optimize loop', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.local_deterministic_boost_final',
          scoreAfter: finalBoost.result.score,
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

    if (forceRerun && localResult.score >= LOCAL_SEO_PASS_THRESHOLD) {
      const refreshed = await this.runForcedLocalRefresh(ctx, {
        briefData: job.briefData,
        currentContent,
        localResult,
        serpData,
        targetWordCount,
        optimizeRounds,
        reason: seoCheck.optimizationRerun?.reason,
      });
      currentContent = refreshed.content;
      localResult = refreshed.localResult;
      optimizeRounds = refreshed.optimizeRounds;
    }

    currentContent = await this.reconcileDraftEnrichments(ctx, currentContent);
    localResult = this.evaluateLocal(
      ctx.targetKeyword,
      currentContent,
      serpData,
      targetWordCount,
    );

    if (!skipLocalPipeline && localResult.score < LOCAL_SEO_PASS_THRESHOLD) {
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

    if (localResult.score >= LOCAL_SEO_PASS_THRESHOLD) {
      await this.persistLocalSeoProgress(ctx, {
        localResult,
        optimizeRounds,
        content: currentContent,
        passed: true,
        existingSeoCheck: seoCheck,
      });
    }

    await this.touchWorkflowProgress(ctx, {
      phase: 'semrush-check',
      localScore: localResult.score,
      message: semrushResumable
        ? `续跑 Semrush 优化（当前 ${job.semrushScore}/10，目标 ≥${SEMRUSH_PASS_THRESHOLD}）…`
        : `本地预检 ${localResult.score} 分已通过，Semrush 终检中（3ue RPA，约 2–5 分钟）…`,
    });

    let semrushResult: SeoScore;
    let preferredNodeKey: string | undefined;
    if (semrushResumable) {
      semrushResult = this.restoreSemrushResult(seoCheck.semrush!, job.semrushScore!);
      preferredNodeKey = semrushResult.node?.trim() || undefined;
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
      preferredNodeKey = semrushResult.node?.trim() || undefined;

      if (!semrushResult.skipped && !hasOptimizeBaseline(optimizeHistory, 'semrush')) {
        await this.llmService.recordOptimizeSnapshot(ctx, {
          phase: 'semrush',
          round: 0,
          kind: 'baseline',
          semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
          scoreAfter: semrushResult.overall,
          localScoreAfter: localResult.score,
          optimizedAt: new Date().toISOString(),
        });
      }
    }

    let semrushOptimizeRounds = countOptimizeRounds(optimizeHistory, 'semrush');
    const isSemrushResume = semrushResumable && semrushOptimizeRounds > 0;
    const semrushRoundCap = resolveSemrushOptimizeRoundCap(
      semrushResult.overall,
      semrushOptimizeRounds,
      isSemrushResume,
    );

    const optimized = await this.executeSemrushOptimizeRounds(ctx, {
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      initialContent: currentContent,
      initialLocalResult: localResult,
      initialSemrushResult: semrushResult,
      seoCheck,
      recommendedKeywords,
      optimizeHistory,
      semrushOptimizeRounds,
      semrushRoundCap,
      localOptimizeRounds: optimizeRounds,
      preferredNodeKey,
    });
    currentContent = optimized.content;
    localResult = optimized.localResult;
    semrushResult = optimized.semrushResult;
    semrushOptimizeRounds = optimized.semrushOptimizeRounds;

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
            actionableIssues: semrushResult.actionableIssues,
            analysisSource: semrushResult.analysisSource,
            apiUrls: semrushResult.apiUrls,
            optimizeRounds: semrushOptimizeRounds,
            submittedKeywords: this.resolvePersistedSubmittedKeywords(
              currentContent,
              ctx.targetKeyword,
              recommendedKeywords,
              semrushResult,
            ),
            semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
            semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
            semrushReadabilityScore: semrushResult.semrushReadabilityScore,
            semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
            semrushEvaluationContentFingerprint:
              semrushResult.semrushEvaluationContentFingerprint,
            semrushTargetKeywords: semrushResult.semrushTargetKeywords,
            semrushRecommendedKeywords: semrushResult.semrushRecommendedKeywords,
            semrushMissingTargetKeywords: semrushResult.semrushMissingTargetKeywords,
            semrushMissingRecommendedKeywords: semrushResult.semrushMissingRecommendedKeywords,
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

  /** 刷新本地 SEO 评分；若规则拆句/拆段可提分则写回正文 */
  async refreshLocalSeoScore(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, serpData: true, briefData: true, seoCheckData: true, localSeoScore: true },
    });

    if (!job?.draftData) {
      return;
    }

    const draft = job.draftData as { content?: string };
    const content = draft.content?.trim();
    if (!content) {
      return;
    }

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const currentResult = this.evaluateLocal(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
    );

    const boosted = this.applyDeterministicLocalBoost(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
      currentResult.score,
    );

    if (boosted.applied && boosted.content !== content) {
      const existingDraft = job.draftData as Record<string, unknown>;
      await this.prisma.articleJob.update({
        where: { id: ctx.jobId },
        data: {
          draftData: { ...existingDraft, content: boosted.content } as object,
        },
      });
    }

    const localResult = boosted.result;

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

  async runManualSemrushCheck(ctx: LlmJobContext): Promise<void> {
    try {
      await this.runManualSemrushCheckInner(ctx);
    } catch (error) {
      if (this.isSemrushWorkAbortedError(error)) {
        this.logger.info('Manual Semrush check aborted in-flight', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.manual_semrush_aborted',
          reason: error instanceof BusinessException ? error.message : String(error),
        });
        return;
      }
      throw error;
    }
  }

  isSemrushWorkAbortedError(error: unknown): boolean {
    return (
      error instanceof BusinessException &&
      error.context?.semrushAborted === true
    );
  }

  /** 手动触发：本地预检达标（≥95）后才跑 Semrush RPA 终检 */
  private async runManualSemrushCheckInner(ctx: LlmJobContext): Promise<void> {
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
    let localResult = this.evaluateLocal(
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
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const seoCheck = (job.seoCheckData ?? {}) as PersistedSeoCheckData;
    const draftWithHistory = job.draftData as {
      content?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
    };

    let currentContent = reconciledContent;
    await this.assertSemrushWorkNotCancelled(ctx);
    let semrushResult = await this.runSemrushCheck(
      {
        content: currentContent,
        keyword: ctx.targetKeyword,
        recommendedKeywords,
      },
      ctx,
    );
    const preferredNodeKey = semrushResult.node?.trim() || undefined;

    if (semrushResult.skipped) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        semrushResult.suggestions[0] ?? 'Semrush 查分已跳过',
      );
    }

    if (!hasOptimizeBaseline(draftWithHistory.optimizeHistory ?? [], 'semrush')) {
      await this.llmService.recordOptimizeSnapshot(ctx, {
        phase: 'semrush',
        round: 0,
        kind: 'baseline',
        semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
        scoreAfter: semrushResult.overall,
        localScoreAfter: localResult.score,
        optimizedAt: new Date().toISOString(),
      });
    }

    const optimized = await this.executeSemrushOptimizeRounds(ctx, {
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      initialContent: currentContent,
      initialLocalResult: localResult,
      initialSemrushResult: semrushResult,
      seoCheck,
      recommendedKeywords,
      optimizeHistory: draftWithHistory.optimizeHistory ?? [],
      preferredNodeKey,
    });
    currentContent = optimized.content;
    localResult = optimized.localResult;
    semrushResult = optimized.semrushResult;

    await this.assertSemrushWorkNotCancelled(ctx);

    const latestJob = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, seoCheckData: true },
    });
    const latestDraft = (latestJob?.draftData ?? draftData) as {
      content?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };
    const prevCheck = (latestJob?.seoCheckData ?? job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const {
      pending: _pending,
      manualCheckPreviousStatus: _manualPrev,
      lastManualCheckError: _lastErr,
      recoveredOrphanOptimizing: _recovered,
      cancelled: _cancelled,
      ...semrushRest
    } = prevSemrush;
    const optimizeHistory = latestDraft.optimizeHistory ?? [];
    const semrushOptimizeRounds = countOptimizeRounds(optimizeHistory, 'semrush');

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
        actionableIssues: semrushResult.actionableIssues,
        analysisSource: semrushResult.analysisSource,
        apiUrls: semrushResult.apiUrls,
        optimizeRounds: semrushOptimizeRounds,
        manualCheckAt: new Date().toISOString(),
        submittedKeywords: this.resolvePersistedSubmittedKeywords(
          currentContent,
          ctx.targetKeyword,
          recommendedKeywords,
          semrushResult,
        ),
        semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
        semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
        semrushReadabilityScore: semrushResult.semrushReadabilityScore,
        semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
        semrushEvaluationContentFingerprint:
          semrushResult.semrushEvaluationContentFingerprint,
        semrushTargetKeywords: semrushResult.semrushTargetKeywords,
        semrushRecommendedKeywords: semrushResult.semrushRecommendedKeywords,
        semrushMissingTargetKeywords: semrushResult.semrushMissingTargetKeywords,
        semrushMissingRecommendedKeywords: semrushResult.semrushMissingRecommendedKeywords,
        lastManualCheckEndedAt: new Date().toISOString(),
      },
      optimizeHistory,
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        status: 'COMPLETED',
        errorMessage: null,
        localSeoScore: localResult.score,
        semrushScore: semrushResult.overall,
        seoCheckData: seoCheckData as object,
        draftData: { ...latestDraft, content: currentContent } as object,
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
        draftData: true,
        briefData: true,
      },
    });

    if (!job || job.status !== 'OPTIMIZING') {
      return (job?.status ?? 'FAILED') as JobStatus;
    }

    const plan = resolveOrphanOptimizingRestore(job);

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
    const { pending: _pending, manualCheckPreviousStatus: _prev, ...semrushRest } = prevSemrush;

    const seoCheckBase = plan.failedStep
      ? withWorkflowMeta(prevCheck, { failedStep: plan.failedStep })
      : prevCheck;

    await this.prisma.articleJob.updateMany({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      data: {
        status: plan.status,
        errorMessage: plan.manualSemrushInterrupted ? null : reason,
        seoCheckData: {
          ...seoCheckBase,
          workflowProgress: plan.manualSemrushInterrupted ? null : prevCheck.workflowProgress ?? null,
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
      restoreStatus: plan.status,
      manualSemrushInterrupted: plan.manualSemrushInterrupted,
      failedStep: plan.failedStep,
      reason,
    });

    return plan.status;
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
    const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;

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
            ? { ...prevSemrush, skipped: true, suggestions: input.semrushResult.suggestions }
            : {
                ...prevSemrush,
                overall: input.semrushResult.overall,
                suggestions: input.semrushResult.suggestions,
                passed: input.semrushResult.overall >= SEMRUSH_PASS_THRESHOLD,
                node: input.semrushResult.node,
                nodeLabel: input.semrushResult.nodeLabel,
                suggestionDetails: input.semrushResult.suggestionDetails,
                actionableIssues: input.semrushResult.actionableIssues,
                analysisSource: input.semrushResult.analysisSource,
                apiUrls: input.semrushResult.apiUrls,
                optimizeRounds: input.semrushOptimizeRounds,
                submittedKeywords: this.resolvePersistedSubmittedKeywords(
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

  /** 取消/僵死恢复后，中止仍在内存中执行的 Semrush 优化与 RPA */
  private async assertSemrushWorkNotCancelled(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { status: true, seoCheckData: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在', { semrushAborted: true });
    }

    const data = (job.seoCheckData ?? {}) as { semrush?: { cancelled?: boolean } };
    if (data.semrush?.cancelled) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Semrush 检测已取消', {
        semrushAborted: true,
      });
    }

    if (job.status !== 'OPTIMIZING') {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '任务已不在优化中，停止 Semrush 后续步骤',
        { semrushAborted: true },
      );
    }
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

  private buildLocalOptimizeContext(
    localResult: LocalSeoScoreResult,
    content: string,
  ): {
    suggestions: string[];
    readabilityPriority: boolean;
    readabilityAudit?: string;
    pointsToGo?: number;
    scoreGapPlan: string;
    contentCoverageMaxed: boolean;
  } {
    const pointsToGo = Math.max(0, LOCAL_SEO_PASS_THRESHOLD - localResult.score);
    const readabilityGap = 20 - localResult.breakdown.readability;
    const nearMiss = pointsToGo > 0 && pointsToGo <= LOCAL_SEO_NEAR_MISS_MARGIN;
    const contentCoverageMaxed =
      localResult.breakdown.keywordCoverage >= 25 &&
      localResult.breakdown.serpTermAlignment >= 25;
    const m = localResult.metrics;
    const readabilityPriority =
      (contentCoverageMaxed && pointsToGo > 0) ||
      (nearMiss &&
        (pointsToGo <= 2 ||
          readabilityGap >= 2 ||
          m.longSentencesOver22 > 2 ||
          m.longParagraphsOver65 > 1 ||
          m.passiveVoiceHits > 6));
    const suggestions = [...localResult.suggestions];
    const audit = this.auditReadability(content, m);
    const scoreGapPlan = buildLocalScoreGapPlan(localResult, LOCAL_SEO_PASS_THRESHOLD);

    if (readabilityPriority || pointsToGo <= 2) {
      if (m.longSentencesOver22 > 2) {
        suggestions.unshift(
          `[可读性·必做] 将超长句从 ${m.longSentencesOver22} 条压到 ≤2 条（评分器按 >22 词计数，不是 25 词）`,
        );
      }
      if (m.longParagraphsOver65 > 1) {
        suggestions.unshift(
          `[可读性·必做] 将超长段从 ${m.longParagraphsOver65} 段压到 ≤1 段（>${LOCAL_PARAGRAPH_MAX_WORDS} 词/段）`,
        );
      }
      if (m.passiveVoiceHits > 6) {
        suggestions.unshift(
          `[可读性] 被动语态 ${m.passiveVoiceHits} 处，须减至 ≤6 处（可 +2 可读性分）`,
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
      contentCoverageMaxed,
    };
  }

  /** 规则化拆句/删填充/压篇幅；仅当分数不降时采纳 */
  private applyDeterministicLocalBoost(
    keyword: string,
    content: string,
    serpData: { organic?: SerpOrganicRow[] } | null,
    targetWordCount: number,
    baselineScore: number,
  ): { content: string; result: LocalSeoScoreResult; applied: boolean } {
    const boosted = boostLocalSeoContent(content, { targetWordCount });
    if (boosted === content) {
      return {
        content,
        result: this.evaluateLocal(keyword, content, serpData, targetWordCount),
        applied: false,
      };
    }
    const result = this.evaluateLocal(keyword, boosted, serpData, targetWordCount);
    if (result.score >= baselineScore) {
      return { content: boosted, result, applied: true };
    }
    return {
      content,
      result: this.evaluateLocal(keyword, content, serpData, targetWordCount),
      applied: false,
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
    const longParagraphs = bodyParagraphs.filter((p) => countWords(p) > LOCAL_PARAGRAPH_MAX_WORDS);

    const longSentenceCount = metrics?.longSentencesOver22 ?? longSentences.length;
    const longParagraphCount = metrics?.longParagraphsOver65 ?? longParagraphs.length;

    const samples = longSentences
      .slice(0, 5)
      .map((s) => `• "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}" (${countWords(s)} words)`);

    const lines = [
      `Scorer counts: ${longSentenceCount} sentences >22 words (need ≤2), ${longParagraphCount} paragraphs >${LOCAL_PARAGRAPH_MAX_WORDS} words (need ≤1).`,
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
    };
  }

  /** Semrush < 9.0 时：LLM 按侧栏改写 → 规则拆段 → 再终检（工作流与手动终检共用） */
  private async executeSemrushOptimizeRounds(
    ctx: LlmJobContext,
    input: {
      jobBriefData: unknown;
      serpData: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      initialContent: string;
      initialLocalResult: LocalSeoScoreResult;
      initialSemrushResult: SeoScore;
      seoCheck: PersistedSeoCheckData;
      recommendedKeywords: string[];
      optimizeHistory: OptimizeHistoryEntry[];
      semrushOptimizeRounds?: number;
      semrushRoundCap?: number;
      localOptimizeRounds?: number;
      preferredNodeKey?: string;
    },
  ): Promise<{
    content: string;
    localResult: LocalSeoScoreResult;
    semrushResult: SeoScore;
    semrushOptimizeRounds: number;
  }> {
    let currentContent = input.initialContent;
    let localResult = input.initialLocalResult;
    let semrushResult = input.initialSemrushResult;
    let semrushOptimizeRounds =
      input.semrushOptimizeRounds ?? countOptimizeRounds(input.optimizeHistory, 'semrush');
    let bestSemrushScore = semrushResult.overall;
    let bestSemrushContent = currentContent;
    let bestSemrushResult = semrushResult;
    let bestLocalAtSemrush = localResult;
    let consecutiveSemrushRollbacks = 0;
    const isSemrushResume = (input.semrushOptimizeRounds ?? 0) > 0;
    const semrushRoundCap =
      input.semrushRoundCap ??
      resolveSemrushOptimizeRoundCap(bestSemrushScore, semrushOptimizeRounds, isSemrushResume);
    const localOptimizeRounds = input.localOptimizeRounds ?? 0;

    while (
      !semrushResult.skipped &&
      semrushResult.overall < SEMRUSH_PASS_THRESHOLD &&
      semrushOptimizeRounds < semrushRoundCap
    ) {
      await this.assertSemrushWorkNotCancelled(ctx);

      const rewriteSuggestions = buildSemrushRewriteSuggestions(semrushResult, currentContent);
      const suggestionsForRound =
        rewriteSuggestions.length > 0
          ? rewriteSuggestions
          : buildFallbackSemrushSuggestions(semrushResult, currentContent);

      semrushOptimizeRounds += 1;
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush',
        round: semrushOptimizeRounds,
        maxRounds: semrushRoundCap,
        localScore: localResult.score,
        semrushScore: semrushResult.overall,
        message: `Semrush ${semrushResult.overall}/10，AI 按侧栏建议优化正文（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`,
      });
      this.logger.info('Semrush below threshold, rewriting draft with suggestions', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.semrush_optimize',
        round: semrushOptimizeRounds,
        score: semrushResult.overall,
        suggestionCount: suggestionsForRound.length,
        usedFallbackSuggestions: rewriteSuggestions.length === 0,
      });

      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
      );
      const protectedSeoPhrases = this.collectProtectedSeoPhrases(
        currentContent,
        ctx.targetKeyword,
        keywordsForAi,
      );
      currentContent = applySemrushSidebarComplexWordFixes(currentContent, semrushResult);
      const semrushOptCtx = buildSemrushOptimizeContext(semrushResult, currentContent);
      const useSurgicalMode =
        isSemrushUltraNearMiss(bestSemrushScore) || consecutiveSemrushRollbacks >= 2;

      if (useSurgicalMode) {
        currentContent = applySemrushNearMissDeterministicFixes(currentContent);
        const surgicalInstruction = buildSemrushNearMissSurgicalInstruction(
          semrushResult,
          currentContent,
        );
        if (surgicalInstruction) {
          await this.touchWorkflowProgress(ctx, {
            phase: 'semrush',
            round: semrushOptimizeRounds,
            maxRounds: semrushRoundCap,
            localScore: localResult.score,
            semrushScore: semrushResult.overall,
            message: `Semrush ${semrushResult.overall}/10，手术式改写侧栏随意句/复杂词（第 ${semrushOptimizeRounds}/${semrushRoundCap} 轮）…`,
          });
          currentContent = await this.llmService.generateSemrushNearMissRewrite(
            ctx,
            currentContent,
            surgicalInstruction,
            {
              phase: 'semrush',
              round: semrushOptimizeRounds,
              semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
              scoreBefore: semrushResult.overall,
              localScore: localResult.score,
            },
          );
        } else {
          currentContent = await this.llmService.generateOptimize(
            ctx,
            currentContent,
            suggestionsForRound,
            keywordsForAi,
            this.buildSemrushOptimizeMeta({
              round: semrushOptimizeRounds,
              semrushResult,
              localResult,
              semrushOptCtx,
              protectedSeoPhrases,
            }),
          );
        }
      } else {
        currentContent = await this.llmService.generateOptimize(
          ctx,
          currentContent,
          suggestionsForRound,
          keywordsForAi,
          this.buildSemrushOptimizeMeta({
            round: semrushOptimizeRounds,
            semrushResult,
            localResult,
            semrushOptCtx,
            protectedSeoPhrases,
          }),
        );
      }
      const semrushBoostTarget = resolveSemrushBoostWordTarget(
        semrushResult.semrushCompetitorWordCount,
        input.targetWordCount,
      );
      currentContent = boostLocalSeoContent(
        currentContent,
        buildSemrushBoostOptions(semrushBoostTarget),
      );
      const structureFix = validateAndFixSemrushStructure(currentContent);
      currentContent = structureFix.content;
      const roundAudit = buildSemrushReadabilityAudit(currentContent);
      const bestAudit = buildSemrushReadabilityAudit(bestSemrushContent);
      const bestSubmittedKeywords =
        bestSemrushResult.semrushTargetKeywords ??
        buildSemrushSubmittedKeywords(bestSemrushContent, {
          targetKeyword: ctx.targetKeyword,
          poolKeywords: keywordsForAi,
        });
      const bestMissingKeywords = this.countSemrushMissingKeywords(
        bestSemrushContent,
        ctx.targetKeyword,
        bestSemrushResult,
        keywordsForAi,
        bestSubmittedKeywords,
      );
      const candidateLocal = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        input.serpData,
        input.targetWordCount,
        {
          competitorWordCount: semrushResult.semrushCompetitorWordCount,
        },
      );
      const semrushKeywords = this.mergeRecommendedKeywordsForWriting(
        input.jobBriefData,
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
        message: `第 ${semrushOptimizeRounds} 轮正文已更新，重新 Semrush 终检中…`,
      });
      await this.assertSemrushWorkNotCancelled(ctx);
      const semrushRpaInput = buildSemrushCheckInputFromContent(
        currentContent,
        ctx.targetKeyword,
        semrushKeywords,
      );
      const candidateSemrush = await this.runSemrushCheck(
        { ...semrushRpaInput, preferredNodeKey: input.preferredNodeKey },
        ctx,
      );
      const candidateMissingKeywords = this.countSemrushMissingKeywords(
        currentContent,
        ctx.targetKeyword,
        candidateSemrush,
        semrushKeywords,
        semrushRpaInput.submittedKeywords,
      );
      const readabilityImproved =
        roundAudit.longParagraphCount < bestAudit.longParagraphCount ||
        roundAudit.longSentenceCount < bestAudit.longSentenceCount;
      const accepted = shouldAcceptSemrushCandidate({
        candidateOverall: candidateSemrush.overall,
        bestOverall: bestSemrushScore,
        candidateMissingKeywordCount: candidateMissingKeywords,
        bestMissingKeywordCount: bestMissingKeywords,
        readabilityImproved,
      });
      this.logger.info('Semrush optimize round metrics', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'seo_checker.semrush_round_metrics',
        round: semrushOptimizeRounds,
        semrushScore: candidateSemrush.overall,
        bestSemrushScore,
        wordGap:
          typeof candidateSemrush.semrushCompetitorWordCount === 'number' &&
          typeof candidateSemrush.semrushCurrentWordCount === 'number'
            ? candidateSemrush.semrushCompetitorWordCount -
              candidateSemrush.semrushCurrentWordCount
            : undefined,
        missingKeywords: candidateMissingKeywords,
        longParagraphs: roundAudit.longParagraphCount,
        longSentences: roundAudit.longSentenceCount,
        structureErrors: detectSemrushStructureErrors(currentContent).length,
        structureFixed: structureFix.fixed,
        rolledBack: !accepted,
      });
      if (accepted) {
        consecutiveSemrushRollbacks = 0;
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
        consecutiveSemrushRollbacks += 1;
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
            rollbackReason: 'score_regressed',
          },
        );
      }
      await this.persistSemrushProgress(ctx, {
        localResult: bestLocalAtSemrush,
        semrushResult: bestSemrushResult,
        localOptimizeRounds,
        semrushOptimizeRounds,
        content: bestSemrushContent,
        existingSeoCheck: input.seoCheck,
        recommendedKeywords: input.recommendedKeywords,
        targetKeyword: ctx.targetKeyword,
      });
    }

    return {
      content: bestSemrushContent,
      localResult: bestLocalAtSemrush,
      semrushResult: bestSemrushResult,
      semrushOptimizeRounds,
    };
  }

  private runSemrushCheck(input: SeoCheckInput, ctx: LlmJobContext): Promise<SeoScore> {
    const resolved =
      input.submittedKeywords && input.submittedKeywords.length > 0
        ? input
        : buildSemrushCheckInputFromContent(
            input.content,
            input.keyword,
            input.recommendedKeywords ?? [],
          );

    const stickyNodeKey = input.preferredNodeKey?.trim() || undefined;
    if (stickyNodeKey) {
      (resolved as SeoCheckInput).preferredNodeKey = stickyNodeKey;
    }

    this.logger.info('Semrush RPA keyword plan', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'seo_checker.semrush_keyword_plan',
      submittedCount: resolved.submittedKeywords?.length ?? 0,
      submittedKeywords: resolved.submittedKeywords,
    });

    return this.semrushQueue.runCheck(resolved, {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
    });
  }

  private resolvePersistedSubmittedKeywords(
    content: string,
    targetKeyword: string,
    poolKeywords: string[],
    semrushResult?: SeoScore,
  ): string[] {
    if (semrushResult?.semrushTargetKeywords && semrushResult.semrushTargetKeywords.length > 0) {
      return semrushResult.semrushTargetKeywords;
    }
    return buildSemrushSubmittedKeywords(content, {
      targetKeyword,
      poolKeywords,
    });
  }

  private async runForcedLocalRefresh(
    ctx: LlmJobContext,
    input: {
      briefData: unknown;
      currentContent: string;
      localResult: LocalSeoScoreResult;
      serpData: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      optimizeRounds: number;
      reason?: 'gsc_underperform' | 'manual';
    },
  ): Promise<{
    content: string;
    localResult: LocalSeoScoreResult;
    optimizeRounds: number;
  }> {
    const forcedCap = 2;
    let currentContent = input.currentContent;
    let localResult = input.localResult;
    let optimizeRounds = input.optimizeRounds;
    let bestContent = currentContent;
    let bestResult = localResult;

    const extraHints =
      input.reason === 'gsc_underperform' ? GSC_UNDERPERFORM_OPTIMIZE_HINTS : [];

    for (let round = 1; round <= forcedCap; round++) {
      optimizeRounds += 1;
      await this.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: optimizeRounds,
        localScore: localResult.score,
        message: `针对性优化正文中（第 ${round}/${forcedCap} 轮，搜索表现刷新）…`,
      });

      const localOptCtx = this.buildLocalOptimizeContext(localResult, currentContent);
      const suggestions = [...new Set([...localOptCtx.suggestions, ...extraHints])];
      const keywordsForAi = this.mergeRecommendedKeywordsForWriting(
        input.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
      );

      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        suggestions,
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
          contentCoverageMaxed: localOptCtx.contentCoverageMaxed,
          protectedSeoPhrases: this.collectProtectedSeoPhrases(
            currentContent,
            ctx.targetKeyword,
            keywordsForAi,
          ),
        },
      );

      currentContent = boostLocalSeoContent(currentContent, { targetWordCount: input.targetWordCount });
      const candidateResult = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        input.serpData,
        input.targetWordCount,
      );
      const nearMiss = bestResult.score >= LOCAL_SEO_PASS_THRESHOLD - LOCAL_SEO_NEAR_MISS_MARGIN;
      const longSentencesImproved =
        candidateResult.metrics.longSentencesOver22 <= 2 &&
        candidateResult.metrics.longSentencesOver22 <
          (bestResult.metrics.longSentencesOver22 ?? Number.MAX_SAFE_INTEGER);
      const longParagraphsImproved =
        candidateResult.metrics.longParagraphsOver65 <= 1 &&
        candidateResult.metrics.longParagraphsOver65 <
          (bestResult.metrics.longParagraphsOver65 ?? Number.MAX_SAFE_INTEGER);
      const improved = shouldAcceptLocalCandidate({
        candidateScore: candidateResult.score,
        bestScore: bestResult.score,
        candidateKeywordCoverage: candidateResult.breakdown.keywordCoverage,
        bestKeywordCoverage: bestResult.breakdown.keywordCoverage,
        nearMiss,
        readabilityImproved: longSentencesImproved || longParagraphsImproved,
      });
      if (improved) {
        bestResult = candidateResult;
        bestContent = currentContent;
        localResult = candidateResult;
      } else {
        await this.llmService.revertDraftContent(ctx, bestContent);
        currentContent = bestContent;
        localResult = bestResult;
      }
    }

    return { content: bestContent, localResult: bestResult, optimizeRounds };
  }

  private evaluateLocal(
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

  private collectProtectedSeoPhrases(
    content: string,
    targetKeyword: string,
    recommendedKeywords: string[],
  ): string[] {
    return collectPresentSeoPhrases(content, [targetKeyword, ...recommendedKeywords]);
  }

  private countSemrushMissingKeywords(
    content: string,
    targetKeyword: string,
    semrushResult: SeoScore,
    extraKeywords?: string[],
    submittedKeywords?: string[],
  ): number {
    const all =
      submittedKeywords && submittedKeywords.length > 0
        ? submittedKeywords
        : mergeSemrushKeywordLists(
            [targetKeyword],
            semrushResult.semrushTargetKeywords,
            semrushResult.semrushRecommendedKeywords,
            extraKeywords,
          );
    return findMissingSemrushKeywords(content, all).length;
  }

  private buildSemrushOptimizeMeta(input: {
    round: number;
    semrushResult: SeoScore;
    localResult: LocalSeoScoreResult;
    semrushOptCtx: ReturnType<typeof buildSemrushOptimizeContext>;
    protectedSeoPhrases: string[];
  }): GenerateOptimizeMeta {
    return {
      phase: 'semrush',
      round: input.round,
      semrushEvaluationRoute: input.semrushResult.semrushEvaluationRoute,
      scoreBefore: input.semrushResult.overall,
      semrushCompetitorWordCount: input.semrushResult.semrushCompetitorWordCount,
      semrushCurrentWordCount: input.semrushResult.semrushCurrentWordCount,
      semrushReadabilityScore: input.semrushResult.semrushReadabilityScore,
      localScore: input.localResult.score,
      localScoreTarget: LOCAL_SEO_PASS_THRESHOLD,
      localScoreBreakdown: this.formatLocalScoreBreakdown(input.localResult),
      focusDimensions: formatFocusDimensions(input.localResult.breakdown),
      readabilityPriority: input.semrushOptCtx.readabilityPriority,
      readabilityAudit: input.semrushOptCtx.readabilityAudit,
      pointsToGo: input.semrushOptCtx.pointsToGo,
      scoreGapPlan: input.semrushOptCtx.scoreGapPlan,
      protectedSeoPhrases: input.protectedSeoPhrases,
    };
  }

  private formatLocalScoreBreakdown(result: LocalSeoScoreResult): string {
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
}
