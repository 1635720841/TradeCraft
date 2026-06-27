/**
 * SEO 查分：生命周期、手动终检与僵死恢复。
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { enforceArticleH1Boundary, validateAndFixSemrushStructure } from '@wm/shared-core';
import {
  resolveSiteSeoScoreConfig,
  hasExplicitSiteSeoScoreSettings,
  buildScoreThresholdsSnapshot,
} from '../../constants/site-seo-score-settings';
import { isSemrushCheckStale, shouldRecoverOrphanOptimizing } from '../../constants/semrush-check';
import { resolveOrphanOptimizingRestore } from '../../utils/semrush-orphan-restore.util';
import { withWorkflowMeta } from '../../constants/workflow-resume';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import { ScoreCalibrationService } from '../score-calibration/score-calibration.service';
import { resolveLocalAlignEffective } from '../../utils/score-calibration-local-align.util';
import type { ScoreCalibrationRuntime, CalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import { appendCalibrationShadow } from '../../utils/score-calibration-runtime.util';
import { appendSeoAnalysisSnapshot, buildSemrushAnalysisSnapshot } from '../../utils/seo-analysis-snapshot.util';
import type { ArticleImageRecord } from '../illustration/article-image.util';
import type { InternalLinkRecord } from '../linking/link-match.util';
import type { LocalSeoScoreResult } from '@wm/shared-core';
import type { ResolvedSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import {
  countOptimizeRounds,
  hasOptimizeBaseline,
} from '../../utils/seo-pipeline.util';
import {
  isLocalGateSoftPass,
  shouldDeferCalibratedGateToSemrushRpa,
  buildLocalGatePersistedFields,
  isLocalGateNearMiss,
  shouldAcceptLocalGateCandidate,
} from '../../utils/score-calibration-local-align.util';
import { formatFocusDimensions } from '../llm/optimize-history-context.util';
import type { LlmJobContext } from '../llm/llm.service';
import { LlmService } from '../llm/llm.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerRpaService } from './seo-checker-rpa.service';
import { SeoCheckerSemrushOptimizeService } from './seo-checker-semrush-optimize.service';
import type { OptimizeHistoryEntry, PersistedSeoCheckData, SerpOrganicRow } from './seo-checker.types';
import { GSC_UNDERPERFORM_OPTIMIZE_HINTS } from './seo-checker.types';
import {
  evaluateLocal,
  formatLocalScoreBreakdown,
  collectProtectedSeoPhrases,
  countSemrushMissingKeywords,
  resolveFrozenLocalScoreFields,
} from './seo-checker-scoring.util';
import { mergeRecommendedKeywordsForWriting, resolvePersistedSubmittedKeywords } from './seo-checker-keywords.util';
import {
  resolveJobLocalGate,
  buildLocalGateEvaluation,
  buildPipelineContentScoreSnapshot,
  applyDeterministicLocalBoost,
} from './seo-checker-gate.util';
import { buildLocalOptimizeContext } from './seo-checker-local-context.util';
import { boostLocalSeoContent, applySemrushHardToReadDeterministicFixes } from '@wm/shared-core';

@Injectable()
export class SeoCheckerLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly logger: LoggerService,
    private readonly scoreCalibrationService: ScoreCalibrationService,
    private readonly progressService: SeoCheckerProgressService,
    private readonly rpaService: SeoCheckerRpaService,
    private readonly semrushOptimizeService: SeoCheckerSemrushOptimizeService,
  ) {}

  async refreshLocalSeoScore(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        siteId: true,
        draftData: true,
        serpData: true,
        briefData: true,
        seoCheckData: true,
        localSeoScore: true,
        site: { select: { settings: true } },
      },
    });

    if (!job?.draftData) {
      return;
    }

    const scoreConfig = resolveSiteSeoScoreConfig(job.site?.settings);
    const calibrationRuntime = await this.loadCalibrationRuntime(ctx, job.siteId);
    const localGate = resolveJobLocalGate(job.site?.settings, calibrationRuntime, scoreConfig);

    const draft = job.draftData as { content?: string; title?: string };
    const rawContent = draft.content?.trim();
    const refreshArticleTitle = draft.title;
    if (!rawContent) {
      return;
    }
    const content = validateAndFixSemrushStructure(
      enforceArticleH1Boundary(rawContent, refreshArticleTitle),
    ).content;

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const currentResult = evaluateLocal(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
    );

    const boosted = applyDeterministicLocalBoost(
      ctx.targetKeyword,
      content,
      serpData,
      targetWordCount,
      currentResult.score,
    );

    if (boosted.content !== rawContent) {
      const existingDraft = job.draftData as Record<string, unknown>;
      await this.prisma.articleJob.update({
        where: { id: ctx.jobId },
        data: {
          draftData: { ...existingDraft, content: boosted.content } as object,
        },
      });
    }

    const localResult = boosted.result;
    const gateEvaluation = buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: boosted.content,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount,
      articleTitle: refreshArticleTitle,
    });

    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        localSeoScore: localResult.score,
        seoCheckData: {
          ...prevCheck,
          scoreThresholds: buildScoreThresholdsSnapshot(scoreConfig),
          local: {
            score: localResult.score,
            breakdown: localResult.breakdown,
            suggestions: localResult.suggestions,
            metrics: localResult.metrics,
            passed: gateEvaluation.passed,
            predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
            gateMode: localGate.mode,
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
      if (isSemrushWorkAbortedError(error)) {
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

  async runManualSemrushCheckInner(ctx: LlmJobContext): Promise<void> {
    if (process.env.SEMRUSH_ENABLED !== 'true') {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'Semrush 未启用，请在 apps/platform/api/.env 设置 SEMRUSH_ENABLED=true',
      );
    }

    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        siteId: true,
        draftData: true,
        serpData: true,
        briefData: true,
        seoCheckData: true,
        status: true,
        site: { select: { settings: true } },
      },
    });

    if (!job?.draftData) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿不存在，无法检测');
    }

    const scoreConfig = resolveSiteSeoScoreConfig(job.site?.settings);
    const roundCapOptions = {
      strictCap: hasExplicitSiteSeoScoreSettings(job.site?.settings),
    };
    const calibrationRuntime = await this.loadCalibrationRuntime(ctx, job.siteId);
    const localGate = resolveJobLocalGate(job.site?.settings, calibrationRuntime, scoreConfig);

    const draftData = job.draftData as {
      content?: string;
      internalLinks?: InternalLinkRecord[];
      articleImages?: ArticleImageRecord[];
    };
    const content = draftData.content?.trim();
    if (!content) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法检测');
    }

    const reconciledContent = await this.progressService.reconcileDraftEnrichments(ctx, content);

    const serpData = job.serpData as { organic?: SerpOrganicRow[] } | null;
    const briefData = job.briefData as { outline?: { targetWordCount?: number } } | null;
    let localResult = evaluateLocal(
      ctx.targetKeyword,
      reconciledContent,
      serpData,
      briefData?.outline?.targetWordCount ?? 1500,
    );
    const manualGateEvaluation = buildLocalGateEvaluation(calibrationRuntime, localGate, {
      localResult,
      targetKeyword: ctx.targetKeyword,
      content: reconciledContent,
      jobBriefData: job.briefData,
      serpData,
      targetWordCount: briefData?.outline?.targetWordCount ?? 1500,
    });

    if (!manualGateEvaluation.passed) {
      const softPass = isLocalGateSoftPass({
        gate: localGate,
        prediction: manualGateEvaluation.prediction,
        localScore: localResult.score,
        localPassThreshold: scoreConfig.localPassThreshold,
      });
      const deferToSemrush = shouldDeferCalibratedGateToSemrushRpa({
        gate: localGate,
        localResult,
        prediction: manualGateEvaluation.prediction,
        scoreConfig,
      });
      if (!softPass && !deferToSemrush) {
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
              predictedSemrush: manualGateEvaluation.prediction?.predictedSemrush,
              gateMode: localGate.mode,
              refreshedAt: new Date().toISOString(),
            },
          } as object,
        },
      });
      const failMessage =
        localGate.mode === 'calibrated'
          ? `预测 Semrush ${manualGateEvaluation.prediction?.predictedSemrush ?? '—'}/10，未达 ${localGate.threshold} 分门槛，须先优化后再 Semrush 终检`
          : `本地预检 ${localResult.score} 分，未达 ${localGate.threshold} 分门槛，须先优化后再 Semrush 终检：${localResult.suggestions.join('；')}`;
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, failMessage);
      }
      if (deferToSemrush) {
        this.logger.info('Manual check: calibrated gate deferred to Semrush RPA', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'seo_checker.manual_calibrated_defer_to_semrush_rpa',
          localScore: localResult.score,
          predictedSemrush: manualGateEvaluation.prediction?.predictedSemrush,
        });
      }
    }

    const recommendedKeywords = mergeRecommendedKeywordsForWriting(
      job.briefData,
      localResult.recommendedKeywords,
      ctx.targetKeyword,
    );
    const targetWordCount = briefData?.outline?.targetWordCount ?? 1500;
    const seoCheck = (job.seoCheckData ?? {}) as PersistedSeoCheckData;
    const calibrationShadowLog: CalibrationShadowEntry[] = Array.isArray(
      (seoCheck as Record<string, unknown>).calibrationShadow,
    )
      ? ((seoCheck as Record<string, unknown>).calibrationShadow as CalibrationShadowEntry[])
      : [];
    const draftWithHistory = job.draftData as {
      content?: string;
      optimizeHistory?: OptimizeHistoryEntry[];
    };

    let currentContent = reconciledContent;
    const frozenLocalAtSemrushEntry = localResult;
    await this.rpaService.assertSemrushWorkNotCancelled(ctx);
    let semrushResult = await this.rpaService.runSemrushCheck(
      {
        content: currentContent,
        keyword: ctx.targetKeyword,
        recommendedKeywords,
      },
      ctx,
      { rpaKind: 'manual' },
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

    const optimized = await this.semrushOptimizeService.executeSemrushOptimizeRounds(ctx, {
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
      calibrationRuntime,
      localGate,
      calibrationShadowLog,
      scoreConfig,
      roundCapOptions,
    });
    currentContent = optimized.content;
    localResult = optimized.localResult;
    semrushResult = optimized.semrushResult;
    calibrationShadowLog.splice(
      0,
      calibrationShadowLog.length,
      ...optimized.calibrationShadowLog,
    );

    await this.rpaService.assertSemrushWorkNotCancelled(ctx);

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

    const manualSubmittedKeywords = resolvePersistedSubmittedKeywords(
      currentContent,
      ctx.targetKeyword,
      recommendedKeywords,
      semrushResult,
    );
    const manualPersistedLocalGate = buildLocalGateEvaluation(
      calibrationRuntime,
      localGate,
      {
        localResult,
        targetKeyword: ctx.targetKeyword,
        content: currentContent,
        jobBriefData: job.briefData,
        serpData,
        targetWordCount,
        submittedKeywords: manualSubmittedKeywords,
        semrushResult,
      },
    );
    const manualFrozenLocal = resolveFrozenLocalScoreFields(
      prevCheck.local,
      frozenLocalAtSemrushEntry,
    );
    const manualPersistedLocalFields = buildLocalGatePersistedFields({
      gate: localGate,
      localScore: manualFrozenLocal.score,
      prediction: manualPersistedLocalGate.prediction,
    });

    const manualContentScoreSnapshot = buildPipelineContentScoreSnapshot({
      ctx,
      content: currentContent,
      localResult,
      semrushResult,
      calibrationRuntime,
      targetWordCount,
      submittedKeywords: manualSubmittedKeywords,
      missingKeywordCount: countSemrushMissingKeywords(
        currentContent,
        ctx.targetKeyword,
        semrushResult,
        recommendedKeywords,
        manualSubmittedKeywords,
      ),
    });
    manualContentScoreSnapshot.localScore = manualFrozenLocal.score;

    const seoCheckBase = {
      ...prevCheck,
      scoreThresholds: buildScoreThresholdsSnapshot(scoreConfig),
      contentScore: manualContentScoreSnapshot,
      local: {
        score: manualFrozenLocal.score,
        breakdown: manualFrozenLocal.breakdown,
        suggestions: manualFrozenLocal.suggestions,
        metrics: manualFrozenLocal.metrics,
        ...manualPersistedLocalFields,
        refreshedAt: new Date().toISOString(),
      },
      semrush: {
        ...semrushRest,
        overall: semrushResult.overall,
        suggestions: semrushResult.suggestions,
        passed: semrushResult.overall >= scoreConfig.semrushPassThreshold,
        node: semrushResult.node,
        nodeLabel: semrushResult.nodeLabel,
        suggestionDetails: semrushResult.suggestionDetails,
        actionableIssues: semrushResult.actionableIssues,
        analysisSource: semrushResult.analysisSource,
        apiUrls: semrushResult.apiUrls,
        optimizeRounds: semrushOptimizeRounds,
        manualCheckAt: new Date().toISOString(),
        submittedKeywords: manualSubmittedKeywords,
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
        semrushCheckRecord: semrushResult.semrushCheckRecord,
      },
      optimizeHistory,
    };

    let seoCheckWithShadow: Record<string, unknown> = seoCheckBase;
    for (const entry of calibrationShadowLog) {
      seoCheckWithShadow = appendCalibrationShadow(seoCheckWithShadow, entry);
    }
    seoCheckWithShadow.calibration = {
      shadowEnabled: calibrationRuntime.shadowEnabled,
      reduceRpaEnabled: calibrationRuntime.reduceRpaEnabled,
      modelSampleCount: calibrationRuntime.model?.sampleCount ?? 0,
      modelMae: calibrationRuntime.model?.holdoutMae ?? null,
      modelTrainMae: calibrationRuntime.model?.mae ?? null,
      proxyUsed: semrushResult.calibrationProxy === true,
      rpaSkippedCount: calibrationShadowLog.filter((entry) => entry.rpaSkipped).length,
    };

    const seoCheckData =
      semrushResult.skipped || semrushResult.calibrationProxy
        ? seoCheckWithShadow
        : appendSeoAnalysisSnapshot(
          seoCheckWithShadow,
          buildSemrushAnalysisSnapshot({
            content: currentContent,
            targetKeyword: ctx.targetKeyword,
            submittedKeywords: manualSubmittedKeywords,
            semrushResult,
            localResult,
            round: semrushOptimizeRounds,
            kind: 'semrush_manual_check',
            includeFullContent: true,
            semrushMissingKeywordCount: countSemrushMissingKeywords(
              currentContent,
              ctx.targetKeyword,
              semrushResult,
              recommendedKeywords,
              manualSubmittedKeywords,
            ),
          }),
        );

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        status: 'COMPLETED',
        errorMessage: null,
        localSeoScore: manualFrozenLocal.score,
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
    await this.progressService.finishManualSemrushCheck(ctx, errorMessage, false);
  }

  async cancelManualSemrushCheck(ctx: LlmJobContext, reason: string): Promise<void> {
    await this.progressService.finishManualSemrushCheck(ctx, reason, true);
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
      const pending = this.rpaService.getSemrushPending(job.seoCheckData);
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

  async loadCalibrationRuntime(
    ctx: LlmJobContext,
    siteId: string,
  ): Promise<ScoreCalibrationRuntime> {
    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
      },
      select: { settings: true },
    });
    const workflow = parseSiteWorkflowSettings(site?.settings);
    const { model, featureMeans } = await this.scoreCalibrationService.loadProjectCalibration(
      ctx.organizationId,
      ctx.projectId,
    );
    const localAlignEnabled = workflow.scoreCalibrationLocalAlign === true;
    const localAlignEffective = resolveLocalAlignEffective({ localAlignEnabled, model });
    return {
      shadowEnabled: workflow.scoreCalibrationShadow !== false,
      reduceRpaEnabled: workflow.scoreCalibrationReduceRpa === true,
      localAlignEnabled,
      localAlignEffective,
      model,
      featureMeans: featureMeans ?? null,
    };
  }

  async runForcedLocalRefresh(
    ctx: LlmJobContext,
    input: {
      briefData: unknown;
      currentContent: string;
      localResult: LocalSeoScoreResult;
      serpData: { organic?: SerpOrganicRow[] } | null;
      targetWordCount: number;
      optimizeRounds: number;
      reason?: 'gsc_underperform' | 'manual';
      scoreConfig: ResolvedSiteSeoScoreConfig;
      siteSettings?: unknown;
      calibrationRuntime: ScoreCalibrationRuntime;
      articleTitle?: string;
    },
  ): Promise<{
    content: string;
    localResult: LocalSeoScoreResult;
    optimizeRounds: number;
  }> {
    const forcedCap = 2;
    const scoreConfig = input.scoreConfig;
    const localGate = resolveJobLocalGate(
      input.siteSettings,
      input.calibrationRuntime,
      scoreConfig,
    );
    let currentContent = input.currentContent;
    let localResult = input.localResult;
    let optimizeRounds = input.optimizeRounds;
    let bestContent = currentContent;
    let bestResult = localResult;
    let bestGateScore = buildLocalGateEvaluation(
      input.calibrationRuntime,
      localGate,
      {
        localResult: bestResult,
        targetKeyword: ctx.targetKeyword,
        content: bestContent,
        jobBriefData: input.briefData,
        serpData: input.serpData,
        targetWordCount: input.targetWordCount,
        articleTitle: input.articleTitle,
      },
    ).gateScore;
    let bestPredictedSemrush =
      localGate.mode === 'calibrated' ? bestGateScore : 0;

    const extraHints =
      input.reason === 'gsc_underperform' ? GSC_UNDERPERFORM_OPTIMIZE_HINTS : [];

    for (let round = 1; round <= forcedCap; round++) {
      optimizeRounds += 1;
      let gateEvaluation = buildLocalGateEvaluation(
        input.calibrationRuntime,
        localGate,
        {
          localResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: input.briefData,
          serpData: input.serpData,
          targetWordCount: input.targetWordCount,
          articleTitle: input.articleTitle,
        },
      );
      await this.progressService.touchWorkflowProgress(ctx, {
        phase: 'local',
        round: optimizeRounds,
        maxRounds: optimizeRounds,
        localScore: localResult.score,
        message: `针对性优化正文中（第 ${round}/${forcedCap} 轮，搜索表现刷新）…`,
      });

      const localOptCtx = buildLocalOptimizeContext(
        localResult,
        currentContent,
        scoreConfig,
        localGate,
        gateEvaluation.prediction,
        {
          targetKeyword: ctx.targetKeyword,
          articleTitle: input.articleTitle,
          targetWordCount: input.targetWordCount,
        },
      );
      const suggestions = [...new Set([...localOptCtx.suggestions, ...extraHints])];
      const keywordsForAi = mergeRecommendedKeywordsForWriting(
        input.briefData,
        localResult.recommendedKeywords,
        ctx.targetKeyword,
      );

      if (localOptCtx.hardSentencePriority) {
        const hardFixed = applySemrushHardToReadDeterministicFixes(currentContent);
        if (hardFixed !== currentContent) {
          const hardResult = evaluateLocal(
            ctx.targetKeyword,
            hardFixed,
            input.serpData,
            input.targetWordCount,
          );
          const hardGate = buildLocalGateEvaluation(input.calibrationRuntime, localGate, {
            localResult: hardResult,
            targetKeyword: ctx.targetKeyword,
            content: hardFixed,
            jobBriefData: input.briefData,
            serpData: input.serpData,
            targetWordCount: input.targetWordCount,
            articleTitle: input.articleTitle,
            poolKeywords: keywordsForAi,
          });
          const hardHits = hardResult.metrics.hardToReadSentenceHits ?? 0;
          const prevHits = localResult.metrics.hardToReadSentenceHits ?? 0;
          if (
            hardHits < prevHits ||
            (hardResult.score >= localResult.score && hardGate.gateScore >= gateEvaluation.gateScore)
          ) {
            currentContent = hardFixed;
            localResult = hardResult;
            gateEvaluation = hardGate;
            if (hardGate.gateScore > bestGateScore) {
              bestGateScore = hardGate.gateScore;
              bestPredictedSemrush =
                hardGate.prediction?.predictedSemrush ?? bestPredictedSemrush;
            }
            if (hardResult.score >= bestResult.score || hardHits < (bestResult.metrics.hardToReadSentenceHits ?? 99)) {
              bestResult = hardResult;
              bestContent = hardFixed;
            }
          }
        }
      }

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
          localScoreTarget: scoreConfig.localPassThreshold,
          calibratedLocalAlign: localGate.mode === 'calibrated',
          predictedSemrush: gateEvaluation.prediction?.predictedSemrush,
          predictedSemrushTarget:
            localGate.mode === 'calibrated' ? localGate.threshold : undefined,
          localScoreBreakdown: formatLocalScoreBreakdown(localResult),
          focusDimensions: formatFocusDimensions(localResult.breakdown),
          readabilityPriority: localOptCtx.readabilityPriority,
          serpPriority: localOptCtx.serpPriority,
          fleschPriority: localOptCtx.fleschPriority,
          hardSentencePriority: localOptCtx.hardSentencePriority,
          titlePriority: localOptCtx.titlePriority,
          wordCountTrimPriority: localOptCtx.wordCountTrimPriority,
          wordCountExpandPriority: localOptCtx.wordCountExpandPriority,
          articleTitle: localOptCtx.resolvedTitle,
          semrushCurrentWordCount: localResult.metrics.wordCount,
          semrushCompetitorWordCount: input.targetWordCount,
          readabilityAudit: localOptCtx.readabilityAudit,
          pointsToGo: localOptCtx.pointsToGo,
          scoreGapPlan: localOptCtx.scoreGapPlan,
          contentCoverageMaxed: localOptCtx.contentCoverageMaxed,
          serpCoverageMaxed: localOptCtx.serpCoverageMaxed,
          keywordDensityFocus: localOptCtx.keywordDensityFocus,
          protectedSeoPhrases: collectProtectedSeoPhrases(
            currentContent,
            ctx.targetKeyword,
            keywordsForAi,
          ),
        },
      );

      currentContent = boostLocalSeoContent(currentContent, { targetWordCount: input.targetWordCount });
      const candidateResult = evaluateLocal(
        ctx.targetKeyword,
        currentContent,
        input.serpData,
        input.targetWordCount,
      );
      const candidateGateEvaluation = buildLocalGateEvaluation(
        input.calibrationRuntime,
        localGate,
        {
          localResult: candidateResult,
          targetKeyword: ctx.targetKeyword,
          content: currentContent,
          jobBriefData: input.briefData,
          serpData: input.serpData,
          targetWordCount: input.targetWordCount,
          articleTitle: input.articleTitle,
        },
      );
      const nearMiss = isLocalGateNearMiss({ gate: localGate, bestGateScore });
      const longSentencesImproved =
        candidateResult.metrics.longSentencesOver22 <= 2 &&
        candidateResult.metrics.longSentencesOver22 <
          (bestResult.metrics.longSentencesOver22 ?? Number.MAX_SAFE_INTEGER);
      const longParagraphsImproved =
        candidateResult.metrics.longParagraphsOver65 <= 1 &&
        candidateResult.metrics.longParagraphsOver65 <
          (bestResult.metrics.longParagraphsOver65 ?? Number.MAX_SAFE_INTEGER);
      const improved = shouldAcceptLocalGateCandidate({
        gate: localGate,
        candidateLocalScore: candidateResult.score,
        bestLocalScore: bestResult.score,
        candidatePredicted: candidateGateEvaluation.gateScore,
        bestPredicted: bestPredictedSemrush,
        candidateKeywordCoverage: candidateResult.breakdown.keywordCoverage,
        bestKeywordCoverage: bestResult.breakdown.keywordCoverage,
        nearMiss,
        readabilityImproved: longSentencesImproved || longParagraphsImproved,
        candidateFlesch: candidateResult.metrics.fleschReadingEase,
        bestFlesch: bestResult.metrics.fleschReadingEase,
        candidateSerpAlignment: candidateResult.breakdown.serpTermAlignment,
        bestSerpAlignment: bestResult.breakdown.serpTermAlignment,
        candidateHardSentenceHits: candidateResult.metrics.hardToReadSentenceHits,
        bestHardSentenceHits: bestResult.metrics.hardToReadSentenceHits,
      });
      if (improved) {
        bestResult = candidateResult;
        bestContent = currentContent;
        localResult = candidateResult;
        bestGateScore = candidateGateEvaluation.gateScore;
        bestPredictedSemrush = candidateGateEvaluation.gateScore;
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          {
            scoreAfter: localResult.score,
            breakdownAfter: localResult.breakdown,
            predictedSemrushAfter:
              localGate.mode === 'calibrated'
                ? candidateGateEvaluation.prediction?.predictedSemrush
                : undefined,
          },
        );
      } else {
        await this.llmService.revertDraftContent(ctx, bestContent);
        currentContent = bestContent;
        localResult = bestResult;
        await this.llmService.patchLastOptimizeRound(
          ctx,
          { phase: 'local', round: optimizeRounds },
          {
            scoreAfter: bestResult.score,
            breakdownAfter: bestResult.breakdown,
            rolledBack: true,
            candidateScoreAfter: candidateResult.score,
            predictedSemrushAfter:
              localGate.mode === 'calibrated' ? bestPredictedSemrush : undefined,
            candidatePredictedSemrush:
              localGate.mode === 'calibrated'
                ? candidateGateEvaluation.prediction?.predictedSemrush
                : undefined,
            rollbackReason:
              localGate.mode === 'calibrated'
                ? 'predicted_semrush_regressed'
                : 'score_regressed',
          },
        );
      }
    }

    return { content: bestContent, localResult: bestResult, optimizeRounds };
  }
}

export function isSemrushWorkAbortedError(error: unknown): boolean {
    return (
      error instanceof BusinessException &&
      error.context?.semrushAborted === true
    );
  }
