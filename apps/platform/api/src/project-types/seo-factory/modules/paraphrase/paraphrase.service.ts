/**
 * QuillBot 原创表达优化服务（M7）：Semrush 后润色 + 程序化/AI 复检。
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
  SEMRUSH_PARAGRAPH_MAX_SENTENCES,
  SEMRUSH_PARAGRAPH_MAX_WORDS,
  validateAndFixSemrushStructure,
  resolveSemrushWordCountHardCap,
} from '@wm/shared-core';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import type { LlmJobContext } from '../llm/llm.service';
import { buildOptimizeBriefContext } from '../llm/optimize-context.util';
import {
  joinParaphraseChunks,
  shouldUseChunkedParaphrase,
  splitContentByH2,
} from './paraphrase-chunk.util';
import { buildParaphraseProtectedTerms } from './paraphrase-protected-terms.util';
import { checkParaphraseLocalScoreRegression } from './paraphrase-regression.util';
import { checkParaphraseSafety } from './paraphrase-safety.util';

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
      await this.markSkipped(ctx, '站点已关闭原创表达优化');
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
      throw new Error('初稿为空，无法执行原创表达优化');
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

    await this.setWorkflowProgress(ctx.jobId, job.seoCheckData, '正在执行原创表达优化…');

    const rawParaphraseResult = shouldUseChunkedParaphrase(originalContent)
      ? await this.paraphraseByChunks(ctx, job.seoCheckData, originalContent, runContext)
      : await this.paraphraseWholeDocument(originalContent, runContext);
    const originalTitle = originalContent.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const formatRepair = validateAndFixSemrushStructure(
      enforceArticleH1Boundary(rawParaphraseResult.content, originalTitle),
    );
    const paraphraseResult = {
      ...rawParaphraseResult,
      content: formatRepair.content,
      warnings: [
        ...(rawParaphraseResult.warnings ?? []),
        ...formatRepair.errors.map((error) => `format_repaired:${error}`),
      ],
    };

    await this.setWorkflowProgress(ctx.jobId, job.seoCheckData, '原创表达优化复检中…');

    const safety = checkParaphraseSafety({
      keyword: ctx.targetKeyword,
      originalContent,
      paraphrasedContent: paraphraseResult.content,
      contentLanguage: ctx.contentLanguage,
      protectedTerms,
      recommendedKeywords: protectedTerms,
    });

    const validation = await this.paraphraseProvider.validate({
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
    return this.paraphraseProvider.paraphrase(this.buildParaphraseInput(originalContent, runContext));
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
    let promptVersion = '';

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      await this.setWorkflowProgress(
        ctx.jobId,
        seoCheckData,
        `原创表达优化中（${index + 1}/${chunks.length}）…`,
      );

      const chunkHint = chunk.isLead
        ? 'Lead section — if this opens the article, keep the target keyword in the first 200 characters.'
        : 'Single H2 section only — do NOT add new ## headings; keyword-in-first-200-chars rule does not apply.';

      const result = await this.paraphraseProvider.paraphrase(
        this.buildParaphraseInput(chunk.content, runContext, chunkHint),
      );
      promptVersion = result.promptVersion;

      const chunkSafety = checkParaphraseSafety({
        keyword: runContext.keyword,
        originalContent: chunk.content,
        paraphrasedContent: result.content,
        contentLanguage: runContext.contentLanguage,
        protectedTerms: runContext.protectedTerms,
        recommendedKeywords: runContext.protectedTerms,
        skipKeywordHeadCheck: !chunk.isLead,
      });

      if (chunkSafety.passed) {
        polishedChunks.push(result.content);
        polishedCount += 1;
        changesSummary.push(...(result.changesSummary ?? []));
        warnings.push(...(result.warnings ?? []));
      } else {
        polishedChunks.push(chunk.content);
        warnings.push(...chunkSafety.issues.map((issue) => `[${chunk.id}] ${issue}`));
      }
    }

    return {
      content: joinParaphraseChunks(polishedChunks.map((content) => ({ content }))),
      promptVersion,
      changesSummary: [...new Set(changesSummary)].slice(0, 12),
      warnings: [...new Set(warnings)].slice(0, 16),
      chunkStats: { total: chunks.length, polished: polishedCount },
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
    const useOriginal = input.paraphrasedContent === input.originalContent;
    const finalContent = applyReadabilityParagraphFix(input.paraphrasedContent, {
      maxWords: SEMRUSH_PARAGRAPH_MAX_WORDS,
      maxSentences: SEMRUSH_PARAGRAPH_MAX_SENTENCES,
    });
    const readabilityRepaired = finalContent !== input.paraphrasedContent;
    const allWarnings = [
      ...input.safetyIssues,
      ...input.validationWarnings,
      ...(input.paraphraseMeta.warnings ?? []),
      ...(input.regressionReason ? [input.regressionReason] : []),
      ...(readabilityRepaired ? ['readability_repaired_before_save'] : []),
    ];

    const seoCheckData = {
      ...((input.seoCheckData ?? {}) as Record<string, unknown>),
      quillbot: {
        completedAt: new Date().toISOString(),
        skipped: false,
        passed: !useOriginal,
        usedOriginal: useOriginal,
        promptVersion: input.paraphraseMeta.promptVersion,
        validatePromptVersion: input.validatePromptVersion,
        changesSummary: input.paraphraseMeta.changesSummary ?? [],
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
          paraphraseOriginalContent: useOriginal ? undefined : input.originalContent,
        } as object,
        seoCheckData: seoCheckData as object,
      },
    });

    this.logger.info('QuillBot paraphrase completed', {
      traceId: input.ctx.traceId,
      jobId: input.jobId,
      usedOriginal: useOriginal,
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
