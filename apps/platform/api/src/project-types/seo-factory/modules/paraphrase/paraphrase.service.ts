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
import { PARAPHRASE_PROVIDER, type IParaphraseProvider } from '@wm/provider-interfaces';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import type { LlmJobContext } from '../llm/llm.service';
import { buildOptimizeBriefContext } from '../llm/optimize-context.util';
import { checkParaphraseSafety } from './paraphrase-safety.util';

export interface ParaphraseJobContext extends LlmJobContext {}

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
      select: { draftData: true, briefData: true, seoCheckData: true },
    });

    if (!job) {
      this.logger.warn('Paraphrase skipped: job not found', { jobId: ctx.jobId, traceId: ctx.traceId });
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
      throw new Error('初稿为空，无法执行 QuillBot 优化');
    }

    const briefContext = buildOptimizeBriefContext(job.briefData);
    const protectedTerms = this.extractProtectedTerms(job.briefData);

    await this.setWorkflowProgress(ctx.jobId, job.seoCheckData, '正在执行原创表达优化…');

    const paraphrased = await this.paraphraseProvider.paraphrase({
      keyword: ctx.targetKeyword,
      content: originalContent,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      protectedTerms,
    });

    const safety = checkParaphraseSafety({
      keyword: ctx.targetKeyword,
      originalContent,
      paraphrasedContent: paraphrased.content,
    });

    await this.setWorkflowProgress(ctx.jobId, job.seoCheckData, 'QuillBot 改写复检中…');

    const validation = await this.paraphraseProvider.validate({
      keyword: ctx.targetKeyword,
      originalContent,
      paraphrasedContent: paraphrased.content,
      contentLanguage: ctx.contentLanguage,
      protectedTerms,
    });

    const useOriginal = !safety.passed || !validation.passed;

    const finalContent = useOriginal ? originalContent : paraphrased.content;
    const allWarnings = [...safety.issues, ...validation.warnings, ...(paraphrased.warnings ?? [])];

    const seoCheckData = {
      ...((job.seoCheckData ?? {}) as Record<string, unknown>),
      quillbot: {
        completedAt: new Date().toISOString(),
        skipped: false,
        passed: !useOriginal,
        usedOriginal: useOriginal,
        promptVersion: paraphrased.promptVersion,
        validatePromptVersion: validation.promptVersion,
        changesSummary: paraphrased.changesSummary ?? [],
        warnings: allWarnings,
        briefSummary: briefContext.briefSummary,
      },
      workflowProgress: null,
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...(draftData ?? {}),
          content: finalContent,
          paraphraseApplied: true,
          paraphraseOriginalContent: useOriginal ? undefined : originalContent,
        } as object,
        seoCheckData: seoCheckData as object,
      },
    });

    this.logger.info('QuillBot paraphrase completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      usedOriginal: useOriginal,
      warningCount: allWarnings.length,
    });
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

  private extractProtectedTerms(briefData: unknown): string[] {
    const brief = briefData as { recommendedEntities?: string[] } | null;
    return (brief?.recommendedEntities ?? []).filter((item) => typeof item === 'string' && item.trim());
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
