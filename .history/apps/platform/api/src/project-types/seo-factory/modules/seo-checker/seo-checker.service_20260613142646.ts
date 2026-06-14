/**
 * SEO 查分服务：本地 TF-IDF 前置校验 → 达标后 Semrush 终检。
 *
 * 边界：
 * - 不负责：初稿生成（LlmService）、工作流状态机（WorkflowService）
 *
 * 入口：
 * - SeoCheckerService
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { scoreLocalSeo, type LocalSeoScoreResult } from '@wm/shared-core';
import {
  SEO_CHECKER_PROVIDER,
  type ISeoCheckerProvider,
  type SeoScore,
} from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  SEMRUSH_PASS_THRESHOLD,
} from '../../constants/seo-score';

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

interface SerpOrganicRow {
  title?: string;
  snippet?: string;
}

@Injectable()
export class SeoCheckerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    @Inject(SEO_CHECKER_PROVIDER) private readonly semrushChecker: ISeoCheckerProvider,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStaleSemrushChecks();
  }

  async runPostDraftPipeline(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, serpData: true, briefData: true },
    });

    if (!job?.draftData) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿不存在，无法进行 SEO 评分');
    }

    const draftData = job.draftData as { content?: string };
    const content = draftData.content ?? '';
    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as {
      outline?: { targetWordCount?: number };
    } | null;
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;

    let currentContent = content;
    await this.touchWorkflowProgress(ctx, {
      phase: 'local-scoring',
      message: '正在计算本地预检分…',
    });
    let localResult = this.evaluateLocal(ctx.targetKeyword, currentContent, serpData, targetWordCount);
    await this.llmService.recordOptimizeSnapshot(ctx, {
      phase: 'local',
      round: 0,
      kind: 'baseline',
      scoreAfter: localResult.score,
      breakdownAfter: localResult.breakdown,
      optimizedAt: new Date().toISOString(),
    });

    let optimizeRounds = 0;

    while (localResult.score < LOCAL_SEO_PASS_THRESHOLD && optimizeRounds < LOCAL_SEO_MAX_OPTIMIZE_ROUNDS) {
      optimizeRounds += 1;
      await this.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
        localScore: localResult.score,
        message: `本地预检 ${localResult.score} 分，AI 优化中（第 ${optimizeRounds}/${LOCAL_SEO_MAX_OPTIMIZE_ROUNDS} 轮，目标 ≥${LOCAL_SEO_PASS_THRESHOLD}，约 1–3 分钟）…`,
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

      currentContent = await this.llmService.generateOptimize(
        ctx,
        currentContent,
        localResult.suggestions,
        keywordsForAi,
        {
          phase: 'local',
          round: optimizeRounds,
          scoreBefore: localResult.score,
          localScore: localResult.score,
          localScoreTarget: LOCAL_SEO_PASS_THRESHOLD,
          localScoreBreakdown: this.formatLocalScoreBreakdown(localResult),
        },
      );
      localResult = this.evaluateLocal(ctx.targetKeyword, currentContent, serpData, targetWordCount);
      await this.llmService.patchLastOptimizeRound(
        ctx,
        { phase: 'local', round: optimizeRounds },
        { scoreAfter: localResult.score, breakdownAfter: localResult.breakdown },
      );
    }

    if (localResult.score < LOCAL_SEO_PASS_THRESHOLD) {
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
      message: `本地预检 ${localResult.score} 分已通过，Semrush 终检中（3ue RPA，约 2–5 分钟）…`,
    });

    let semrushResult = await this.semrushChecker.checkScore({
      content: currentContent,
      keyword: ctx.targetKeyword,
      recommendedKeywords,
    });

    if (!semrushResult.skipped) {
      await this.llmService.recordOptimizeSnapshot(ctx, {
        phase: 'semrush',
        round: 0,
        kind: 'baseline',
        scoreAfter: semrushResult.overall,
        localScoreAfter: localResult.score,
        optimizedAt: new Date().toISOString(),
      });
    }

    let semrushOptimizeRounds = 0;
    while (
      !semrushResult.skipped &&
      semrushResult.overall < SEMRUSH_PASS_THRESHOLD &&
      semrushOptimizeRounds < SEMRUSH_MAX_OPTIMIZE_ROUNDS
    ) {
      const rewriteSuggestions = this.buildRewriteSuggestions(semrushResult);
      if (rewriteSuggestions.length === 0) break;

      semrushOptimizeRounds += 1;
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush',
        round: semrushOptimizeRounds,
        maxRounds: SEMRUSH_MAX_OPTIMIZE_ROUNDS,
        localScore: localResult.score,
        semrushScore: semrushResult.overall,
        message: `Semrush ${semrushResult.overall}/10，AI 按侧栏建议优化（第 ${semrushOptimizeRounds}/${SEMRUSH_MAX_OPTIMIZE_ROUNDS} 轮）…`,
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
        },
      );
      localResult = this.evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        serpData,
        targetWordCount,
      );
      const semrushKeywords = this.mergeRecommendedKeywordsForWriting(
        job.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
        semrushResult.semrushRecommendedKeywords,
      );
      await this.touchWorkflowProgress(ctx, {
        phase: 'semrush-check',
        round: semrushOptimizeRounds,
        maxRounds: SEMRUSH_MAX_OPTIMIZE_ROUNDS,
        localScore: localResult.score,
        semrushScore: semrushResult.overall,
        message: `第 ${semrushOptimizeRounds} 轮优化完成，重新 Semrush 终检中…`,
      });
      semrushResult = await this.semrushChecker.checkScore({
        content: currentContent,
        keyword: ctx.targetKeyword,
        recommendedKeywords: semrushKeywords,
      });
      await this.llmService.patchLastOptimizeRound(
        ctx,
        { phase: 'semrush', round: semrushOptimizeRounds },
        {
          scoreAfter: semrushResult.overall,
          localScoreAfter: localResult.score,
        },
      );
    }

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

    return [...new Set([...fromBrief, ...localRecommendedKeywords, ...(semrushRecommendedKeywords ?? [])])]
      .flatMap((item) => splitParts([item]))
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.toLowerCase() !== main)
      .slice(0, 20);
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

  /** 手动触发：本地预检达标（≥90）后才跑 Semrush RPA 终检 */
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

    const draftData = job.draftData as { content?: string };
    const content = draftData.content?.trim();
    if (!content) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法检测');
    }

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    const localResult = this.evaluateLocal(
      ctx.targetKeyword,
      content,
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

    const semrushResult = await this.semrushChecker.checkScore({
      content,
      keyword: ctx.targetKeyword,
      recommendedKeywords,
    });

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
      `Current total ${result.score}/100`,
      `- Keyword coverage ${b.keywordCoverage}/25 (opening keyword + density 0.8–2.5% + keyword in H2)`,
      `- SERP entities ${b.serpTermAlignment}/25 (matched ${result.metrics.matchedSerpTerms}/${result.metrics.totalSerpTerms})`,
      `- Structure ${b.structure}/20 (H2≥4 + length 70–105% + bullet list)`,
      `- Readability ${b.readability}/20 (short paragraphs/sentences, less passive voice)`,
      `- Content depth ${b.contentDepth}/10 (≥700 words + terminology richness)`,
    ];
    if (result.recommendedKeywords.length > 0) {
      lines.push(`- Missing SERP terms (use exact form): ${result.recommendedKeywords.slice(0, 12).join(', ')}`);
    }
    return lines.join('\n');
  }
}
