/**
 * QuillBot 原创表达优化服务（paraphrasing / M6b）：Semrush 后润色 + 程序化/AI 复检。
 *
 * 边界：
 * - 不负责：Semrush 循环优化（SeoCheckerService）
 *
 * 入口：
 * - ParaphraseService
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  PARAPHRASE_PROVIDER,
  type IParaphraseProvider,
  type ParaphraseInput,
  type ParaphraseOutput,
} from '@wm/provider-interfaces';
import {
  applyReadabilityParagraphFix,
  enforceArticleH1Boundary,
  formatParaphraseChunkProgress,
  PARAPHRASE_EMPTY_DRAFT_ERROR,
  PARAPHRASE_PROGRESS_RUNNING,
  PARAPHRASE_PROGRESS_VALIDATING,
  PARAPHRASE_SITE_DISABLED,
  SEMRUSH_PARAGRAPH_MAX_SENTENCES,
  SEMRUSH_PARAGRAPH_MAX_WORDS,
  validateAndFixSemrushStructure,
  resolveSemrushWordCountHardCap,
} from '@wm/shared-core';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import {
  PARAPHRASE_CHUNK_LENGTH_MAX,
  PARAPHRASE_CHUNK_LENGTH_MIN,
  PARAPHRASE_MAX_CHANGE_RATIO_FOR_VALIDATE_SKIP,
  PARAPHRASE_MIN_CHUNK_SUCCESS_RATIO,
} from '../../constants/paraphrase';
import type { LlmJobContext } from '../llm/llm.service';
import { buildOptimizeBriefContext } from '../llm/optimize-context.util';
import {
  applyDeterministicAntiAiPolish,
} from './paraphrase-cliche.util';
import {
  joinParaphraseChunks,
  shouldUseChunkedParaphrase,
  splitContentByH2,
} from './paraphrase-chunk.util';
import { buildParaphraseProtectedTerms } from './paraphrase-protected-terms.util';
import { checkParaphraseLocalScoreRegression } from './paraphrase-regression.util';
import { isPolishUnneededOutcome } from './paraphrase-outcome.util';
import { isNearlyIdenticalParaphrase } from './paraphrase-similarity.util';
import { checkParaphraseSafety } from './paraphrase-safety.util';
import {
  finalizeParaphraseMediaContent,
  resolveParaphraseChunkSkip,
  shieldParaphraseMedia,
  syncAllMediaFromOriginal,
  unshieldParaphraseMedia,
} from './paraphrase-media.util';

export interface ParaphraseJobContext extends LlmJobContext {}

interface ParaphraseRunContext {
  keyword: string;
  brandVoice?: string;
  contentLanguage?: string;
  protectedTerms: string[];
  briefSummary: string;
  searchIntent: string;
  semrushMeta: {
    semrushCurrentWordCount?: number;
    semrushCompetitorWordCount?: number;
    semrushWordCountCap?: number;
  };
}

interface ParaphraseFinalizeInput {
  ctx: ParaphraseJobContext;
  jobId: string;
  draftData: Record<string, unknown>;
  seoCheckData: unknown;
  briefSummary: string;
  protectedTerms: string[];
  originalContent: string;
  paraphrasedContent: string;
  paraphraseMeta: ParaphraseOutput;
  validatePromptVersion: string;
  validationPassed: boolean;
  safetyIssues: string[];
  validationWarnings: string[];
  regressionReason?: string;
  localScoreBefore?: number;
  localScoreAfter?: number;
  chunkStats?: { total: number; polished: number };
}

@Injectable()
export class ParaphraseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Inject(PARAPHRASE_PROVIDER) private readonly paraphraseProvider: IParaphraseProvider,
  ) {}

  async runForJob(ctx: ParaphraseJobContext): Promise<void> {
    if (process.env.QUILLBOT_DISABLED === 'true') {
      await this.markSkipped(ctx, 'QUILLBOT_DISABLED=true');
      return;
    }

    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: {
        draftData: true,
        briefData: true,
        seoCheckData: true,
        serpData: true,
        site: { select: { settings: true } },
      },
    });

    if (!job) {
      this.logger.warn('Paraphrase skipped: job not found', { jobId: ctx.jobId, traceId: ctx.traceId });
      return;
    }

    const siteWorkflow = parseSiteWorkflowSettings(job.site?.settings);
    if (!siteWorkflow.enableParaphrase) {
      await this.markSkipped(ctx, PARAPHRASE_SITE_DISABLED);
      return;
    }

    const draftData = job.draftData as {
      content?: string;
      paraphraseApplied?: boolean;
    } | null;

    if (draftData?.paraphraseApplied) {
      return;
    }

    const originalContent = draftData?.content?.trim();
    if (!originalContent) {
      throw new Error(PARAPHRASE_EMPTY_DRAFT_ERROR);
    }

    const briefContext = buildOptimizeBriefContext(job.briefData);
    const protectedTerms = buildParaphraseProtectedTerms({
      briefData: job.briefData,
      seoCheckData: job.seoCheckData,
      siteSettings: job.site?.settings,
      originalContent,
      targetKeyword: ctx.targetKeyword,
    });
    const runContext: ParaphraseRunContext = {
      keyword: ctx.targetKeyword,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      protectedTerms,
      briefSummary: briefContext.briefSummary,
      searchIntent: briefContext.searchIntent,
      semrushMeta: this.extractSemrushWordMeta(job.seoCheckData),
    };

    await this.setWorkflowProgress(ctx.jobId, job.seoCheckData, PARAPHRASE_PROGRESS_RUNNING);

    const rawParaphraseResult = shouldUseChunkedParaphrase(originalContent)
      ? await this.paraphraseByChunks(ctx, job.seoCheckData, originalContent, runContext)
      : await this.paraphraseWholeDocument(originalContent, runContext);

    let workingContent = syncAllMediaFromOriginal(originalContent, rawParaphraseResult.content);
    const { content: shieldedForFormat, tokens: formatMediaTokens } = shieldParaphraseMedia(workingContent);
    const originalTitle = originalContent.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const formatRepair = validateAndFixSemrushStructure(
      enforceArticleH1Boundary(shieldedForFormat, originalTitle),
    );
    workingContent = syncAllMediaFromOriginal(
      originalContent,
      unshieldParaphraseMedia(formatRepair.content, formatMediaTokens),
    );
    const paraphraseResult = {
      ...rawParaphraseResult,
      content: workingContent,
      warnings: [
        ...(rawParaphraseResult.warnings ?? []),
        ...formatRepair.errors.map((error) => `format_repaired:${error}`),
      ],
    };

    await this.setWorkflowProgress(ctx.jobId, job.seoCheckData, PARAPHRASE_PROGRESS_VALIDATING);

    const safety = checkParaphraseSafety({
      keyword: ctx.targetKeyword,
      originalContent,
      paraphrasedContent: paraphraseResult.content,
      contentLanguage: ctx.contentLanguage,
      protectedTerms,
      recommendedKeywords: protectedTerms,
    });

    const skipLlmValidate =
      safety.passed &&
      (paraphraseResult.content === originalContent ||
        isNearlyIdenticalParaphrase(
          originalContent,
          paraphraseResult.content,
          ctx.contentLanguage,
          PARAPHRASE_MAX_CHANGE_RATIO_FOR_VALIDATE_SKIP,
        ));

    const validation = skipLlmValidate
      ? {
          passed: true,
          warnings: ['validate_skipped:minimal_change'],
          promptVersion: 'safety_gate',
        }
      : await this.paraphraseProvider.validate({
          keyword: ctx.targetKeyword,
          originalContent,
          paraphrasedContent: paraphraseResult.content,
          contentLanguage: ctx.contentLanguage,
          protectedTerms,
        });

    let regressionReason: string | undefined;
    let localScoreBefore: number | undefined;
    let localScoreAfter: number | undefined;
    let regressionRevert = false;

    if (safety.passed && validation.passed) {
      const serpOrganic = (job.serpData as { organic?: Array<{ title?: string; snippet?: string }> } | null)
        ?.organic;
      const regression = checkParaphraseLocalScoreRegression({
        keyword: ctx.targetKeyword,
        originalContent,
        paraphrasedContent: paraphraseResult.content,
        serpOrganic,
        targetWordCount: briefContext.targetWordCount,
      });
      localScoreBefore = regression.scoreBefore;
      localScoreAfter = regression.scoreAfter;
      if (regression.revert) {
        regressionRevert = true;
        regressionReason = regression.reason;
      }
    }

    const useOriginal = !safety.passed || !validation.passed || regressionRevert;

    await this.finalizeParaphrase({
      ctx,
      jobId: ctx.jobId,
      draftData: (draftData ?? {}) as Record<string, unknown>,
      seoCheckData: job.seoCheckData,
      briefSummary: briefContext.briefSummary,
      protectedTerms,
      originalContent,
      paraphrasedContent: useOriginal ? originalContent : paraphraseResult.content,
      paraphraseMeta: paraphraseResult,
      validatePromptVersion: validation.promptVersion,
      validationPassed: validation.passed,
      safetyIssues: safety.issues,
      validationWarnings: validation.warnings,
      regressionReason,
      localScoreBefore,
      localScoreAfter,
      chunkStats: paraphraseResult.chunkStats,
    });
  }

  private async paraphraseWholeDocument(
    originalContent: string,
    runContext: ParaphraseRunContext,
  ): Promise<ParaphraseOutput & { chunkStats?: { total: number; polished: number } }> {
    const skipReason = resolveParaphraseChunkSkip(originalContent);
    if (skipReason) {
      const deterministic = applyDeterministicAntiAiPolish(originalContent);
      if (deterministic.changed) {
        const safety = checkParaphraseSafety({
          keyword: runContext.keyword,
          originalContent,
          paraphrasedContent: deterministic.content,
          contentLanguage: runContext.contentLanguage,
          protectedTerms: runContext.protectedTerms,
          recommendedKeywords: runContext.protectedTerms,
          lengthRatioMin: PARAPHRASE_CHUNK_LENGTH_MIN,
          lengthRatioMax: PARAPHRASE_CHUNK_LENGTH_MAX,
        });
        if (safety.passed) {
          return {
            content: deterministic.content,
            promptVersion: 'deterministic_anti_ai',
            changesSummary: ['deterministic_anti_ai_polish'],
            warnings: [],
          };
        }
      }

      return {
        content: originalContent,
        promptVersion: '',
        changesSummary: [],
        warnings: [`document_skipped:${skipReason}`],
      };
    }

    return this.paraphraseShieldedContent(originalContent, runContext);
  }

  private buildChunkSafetyInput(
    runContext: ParaphraseRunContext,
    chunk: { content: string; isLead: boolean },
    paraphrasedContent: string,
  ) {
    return {
      keyword: runContext.keyword,
      originalContent: chunk.content,
      paraphrasedContent,
      contentLanguage: runContext.contentLanguage,
      protectedTerms: runContext.protectedTerms,
      recommendedKeywords: runContext.protectedTerms,
      skipKeywordHeadCheck: !chunk.isLead,
      lengthRatioMin: PARAPHRASE_CHUNK_LENGTH_MIN,
      lengthRatioMax: PARAPHRASE_CHUNK_LENGTH_MAX,
    };
  }

  private async paraphraseByChunks(
    ctx: ParaphraseJobContext,
    seoCheckData: unknown,
    originalContent: string,
    runContext: ParaphraseRunContext,
  ): Promise<ParaphraseOutput & { chunkStats?: { total: number; polished: number } }> {
    const chunks = splitContentByH2(originalContent);
    const polishedChunks: string[] = [];
    const changesSummary: string[] = [];
    const warnings: string[] = [];
    let polishedCount = 0;
    let llmEligibleCount = 0;
    let llmPolishedCount = 0;
    let promptVersion = '';

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      await this.setWorkflowProgress(
        ctx.jobId,
        seoCheckData,
        formatParaphraseChunkProgress(index + 1, chunks.length),
      );

      const skipReason = resolveParaphraseChunkSkip(chunk.content, { isLead: chunk.isLead });
      if (skipReason) {
        const deterministic = applyDeterministicAntiAiPolish(chunk.content);
        if (deterministic.changed) {
          const detSafety = checkParaphraseSafety(
            this.buildChunkSafetyInput(runContext, chunk, deterministic.content),
          );
          if (detSafety.passed) {
            polishedChunks.push(deterministic.content);
            polishedCount += 1;
            changesSummary.push(`[${chunk.id}] deterministic_anti_ai_polish`);
            continue;
          }
        }

        polishedChunks.push(chunk.content);
        warnings.push(`[${chunk.id}] chunk_skipped:${skipReason}`);
        continue;
      }

      llmEligibleCount += 1;

      const chunkHint = chunk.isLead
        ? 'Lead intro section — change at most 1 sentence with obvious AI clichés only; target keyword MUST stay within first 200 characters; do NOT add ##/### headings; preserve protected terms verbatim.'
        : 'Single H2 section only — change at most 1–2 awkward sentences; do NOT add ##/### headings; keep word count within 98%–102%; preserve protected terms verbatim.';

      const result = await this.paraphraseShieldedContent(chunk.content, runContext, chunkHint);
      promptVersion = result.promptVersion;

      const chunkSafety = checkParaphraseSafety(
        this.buildChunkSafetyInput(runContext, chunk, result.content),
      );

      if (chunkSafety.passed) {
        polishedChunks.push(result.content);
        polishedCount += 1;
        llmPolishedCount += 1;
        changesSummary.push(...(result.changesSummary ?? []));
        warnings.push(...(result.warnings ?? []));
      } else {
        polishedChunks.push(chunk.content);
        warnings.push(...chunkSafety.issues.map((issue) => `[${chunk.id}] ${issue}`));
      }
    }

    if (
      llmEligibleCount > 0 &&
      llmPolishedCount / llmEligibleCount < PARAPHRASE_MIN_CHUNK_SUCCESS_RATIO
    ) {
      warnings.push(
        `paraphrase_partial:low_llm_success_rate (${llmPolishedCount}/${llmEligibleCount})`,
      );
    }

    return {
      content: joinParaphraseChunks(polishedChunks.map((content) => ({ content }))),
      promptVersion,
      changesSummary: [...new Set(changesSummary)].slice(0, 12),
      warnings: [...new Set(warnings)].slice(0, 32),
      chunkStats: { total: chunks.length, polished: polishedCount },
    };
  }

  private async paraphraseShieldedContent(
    originalContent: string,
    runContext: ParaphraseRunContext,
    chunkHint?: string,
  ): Promise<ParaphraseOutput> {
    const { content: shielded, tokens } = shieldParaphraseMedia(originalContent);
    const result = await this.paraphraseProvider.paraphrase(
      this.buildParaphraseInput(shielded, runContext, chunkHint),
    );
    return {
      ...result,
      content: finalizeParaphraseMediaContent(originalContent, result.content, tokens),
    };
  }

  private buildParaphraseInput(
    content: string,
    runContext: ParaphraseRunContext,
    chunkHint?: string,
  ): ParaphraseInput {
    return {
      keyword: runContext.keyword,
      content,
      brandVoice: runContext.brandVoice,
      contentLanguage: runContext.contentLanguage,
      protectedTerms: runContext.protectedTerms,
      searchIntent: runContext.searchIntent,
      briefSummary: runContext.briefSummary,
      chunkHint,
      ...runContext.semrushMeta,
    };
  }

  private async finalizeParaphrase(input: ParaphraseFinalizeInput): Promise<void> {
    const { content: shieldedForReadability, tokens: readabilityTokens } = shieldParaphraseMedia(
      input.paraphrasedContent,
    );
    const readabilityFixed = applyReadabilityParagraphFix(shieldedForReadability, {
      maxWords: SEMRUSH_PARAGRAPH_MAX_WORDS,
      maxSentences: SEMRUSH_PARAGRAPH_MAX_SENTENCES,
    });
    const finalContent = syncAllMediaFromOriginal(
      input.originalContent,
      unshieldParaphraseMedia(readabilityFixed, readabilityTokens),
    );
    const readabilityRepaired = finalContent !== input.paraphrasedContent;
    const allWarnings = [
      ...input.safetyIssues,
      ...input.validationWarnings,
      ...(input.paraphraseMeta.warnings ?? []),
      ...(input.regressionReason ? [input.regressionReason] : []),
      ...(readabilityRepaired ? ['readability_repaired_before_save'] : []),
    ];
    const contentUnchanged = finalContent.trim() === input.originalContent.trim();
    const polishUnneeded = isPolishUnneededOutcome({
      contentUnchanged,
      chunksPolished: input.chunkStats?.polished,
      safetyIssueCount: input.safetyIssues.length,
      validationPassed: input.validationPassed,
      regressionReason: input.regressionReason,
      warnings: allWarnings,
    });
    const keptOriginalDueToFailure = contentUnchanged && !polishUnneeded;

    const seoCheckData = {
      ...((input.seoCheckData ?? {}) as Record<string, unknown>),
      quillbot: {
        completedAt: new Date().toISOString(),
        skipped: false,
        passed: polishUnneeded || !keptOriginalDueToFailure,
        usedOriginal: keptOriginalDueToFailure,
        polishUnneeded,
        promptVersion: input.paraphraseMeta.promptVersion,
        validatePromptVersion: input.validatePromptVersion,
        changesSummary: keptOriginalDueToFailure ? [] : (input.paraphraseMeta.changesSummary ?? []),
        warnings: allWarnings,
        briefSummary: input.briefSummary,
        protectedTermCount: input.protectedTerms.length,
        chunkCount: input.chunkStats?.total,
        chunksPolished: input.chunkStats?.polished,
        localScoreBefore: input.localScoreBefore,
        localScoreAfter: input.localScoreAfter,
      },
      workflowProgress: null,
    };

    await this.prisma.articleJob.update({
      where: { id: input.jobId },
      data: {
        draftData: {
          ...input.draftData,
          content: finalContent,
          paraphraseApplied: true,
          paraphraseOriginalContent: keptOriginalDueToFailure ? undefined : input.originalContent,
        } as object,
        seoCheckData: seoCheckData as object,
      },
    });

    this.logger.info('QuillBot paraphrase completed', {
      traceId: input.ctx.traceId,
      jobId: input.jobId,
      polishUnneeded,
      keptOriginalDueToFailure,
      warningCount: allWarnings.length,
      protectedTermCount: input.protectedTerms.length,
      chunkCount: input.chunkStats?.total,
      chunksPolished: input.chunkStats?.polished,
      localScoreBefore: input.localScoreBefore,
      localScoreAfter: input.localScoreAfter,
      readabilityRepaired,
    });
  }

  private extractSemrushWordMeta(seoCheckData: unknown): {
    semrushCurrentWordCount?: number;
    semrushCompetitorWordCount?: number;
    semrushWordCountCap?: number;
  } {
    const semrush = (seoCheckData as { semrush?: Record<string, unknown> } | null)?.semrush;
    if (!semrush) return {};

    const current =
      typeof semrush.semrushCurrentWordCount === 'number' ? semrush.semrushCurrentWordCount : undefined;
    const competitor =
      typeof semrush.semrushCompetitorWordCount === 'number'
        ? semrush.semrushCompetitorWordCount
        : undefined;
    const cap =
      typeof competitor === 'number'
        ? resolveSemrushWordCountHardCap(competitor)
        : typeof current === 'number'
          ? current
          : undefined;

    return {
      semrushCurrentWordCount: current,
      semrushCompetitorWordCount: competitor,
      semrushWordCountCap: cap,
    };
  }

  private async markSkipped(ctx: ParaphraseJobContext, reason: string): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId },
      select: { draftData: true, seoCheckData: true },
    });

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...((job?.draftData ?? {}) as object),
          paraphraseApplied: true,
        } as object,
        seoCheckData: {
          ...((job?.seoCheckData ?? {}) as Record<string, unknown>),
          quillbot: {
            skipped: true,
            passed: true,
            completedAt: new Date().toISOString(),
            warnings: [reason],
          },
          workflowProgress: null,
        } as object,
      },
    });

    this.logger.info('QuillBot paraphrase skipped', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      reason,
    });
  }

  private async setWorkflowProgress(
    jobId: string,
    seoCheckData: unknown,
    message: string,
  ): Promise<void> {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        seoCheckData: {
          ...((seoCheckData ?? {}) as Record<string, unknown>),
          workflowProgress: {
            phase: 'paraphrasing',
            message,
            updatedAt: new Date().toISOString(),
          },
        } as object,
      },
    });
  }
}
