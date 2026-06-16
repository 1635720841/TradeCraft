/**
 * 文章任务手动 AI 重写：触发、采纳、放弃候选版本。
 *
 * 边界：
 * - 不负责：LLM Prompt 实现（LlmService / Provider）
 *
 * 入口：
 * - ArticleJobRewriteService
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  isRewriteStale,
  REWRITE_HISTORY_MAX,
  type RewriteCandidate,
  type RewriteHistoryEntry,
  type RewritePending,
} from '../../constants/rewrite';
import { isSemrushCheckStale, type SemrushCheckPending } from '../../constants/semrush-check';
import { enrichBrandVoiceForPrompt } from '../../constants/site-settings';
import type { LlmJobContext } from '../llm/llm.service';
import { LlmService } from '../llm/llm.service';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import type { AcceptRewriteArticleJobDto } from './dto/rewrite-article-job.dto';
import type { RewriteArticleJobDto } from './dto/rewrite-article-job.dto';
import { ArticleJobService } from './article-job.service';

interface DraftRewriteState {
  title?: string;
  metaDescription?: string;
  content?: string;
  promptVersion?: string;
  rewritePending?: RewritePending;
  rewriteCandidate?: RewriteCandidate;
  rewriteHistory?: RewriteHistoryEntry[];
  lastRewriteError?: string;
}

@Injectable()
export class ArticleJobRewriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly llmService: LlmService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly articleJobService: ArticleJobService,
  ) {}

  async triggerRewrite(
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: RewriteArticleJobDto,
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        seoCheckData: true,
        contentLanguage: true,
        site: { select: { brandVoice: true, contentLanguage: true, settings: true } },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = job.draftData as DraftRewriteState | null;
    const content = draft?.content?.trim();
    if (!content) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '初稿正文为空，无法重写');
    }

    this.assertNoConflictingOps(job.status, job.draftData, job.seoCheckData);

    let pending = this.getRewritePending(job.draftData);
    if (pending && isRewriteStale(pending.startedAt)) {
      await this.clearRewritePending(jobId, draft, '上次 AI 重写已超时，正在重新发起');
      pending = null;
    } else if (pending) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'AI 重写进行中，请稍候');
    }

    if (draft?.rewriteCandidate) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '请先采纳或放弃当前 AI 候选版本，再发起新的重写',
      );
    }

    if (dto.mode === 'instruction' && !dto.instruction?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写改写指令');
    }

    const rewritePending: RewritePending = {
      startedAt: new Date().toISOString(),
      mode: dto.mode,
      instruction: dto.instruction?.trim() || undefined,
    };

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        errorMessage: null,
        draftData: {
          ...draft,
          rewritePending,
          lastRewriteError: undefined,
        } as object,
      },
    });

    const ctx: LlmJobContext = {
      jobId,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
      brandVoice: enrichBrandVoiceForPrompt(job.site.brandVoice, job.site.settings) ?? undefined,
      contentLanguage: job.contentLanguage ?? job.site.contentLanguage ?? 'en',
    };

    void this.runManualRewrite(ctx, dto, content, draft).catch(async (error) => {
      const message = this.resolveErrorMessage(error, 'AI 重写失败');
      await this.markRewriteFailed(ctx, message);
    });

    this.logger.info('Manual AI rewrite triggered', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId,
      action: 'article_job.rewrite_trigger',
      mode: dto.mode,
    });

    return {
      id: job.id,
      traceId: job.traceId,
      status: job.status,
      targetKeyword: job.targetKeyword,
    };
  }

  async acceptRewrite(
    organizationId: string,
    projectId: string,
    jobId: string,
    options: AcceptRewriteArticleJobDto = {},
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        contentLanguage: true,
        site: { select: { brandVoice: true, contentLanguage: true, settings: true } },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = job.draftData as DraftRewriteState | null;
    const candidate = draft?.rewriteCandidate;
    if (!candidate?.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '没有可采纳的 AI 候选版本');
    }

    const history = this.appendHistory(draft?.rewriteHistory, {
      id: uuidv4(),
      mode: candidate.mode,
      status: 'accepted',
      instruction: candidate.instruction,
      changesSummary: candidate.changesSummary,
      createdAt: new Date().toISOString(),
    });

    const nextDraft: DraftRewriteState = {
      ...draft,
      content: candidate.content,
      title: candidate.title ?? draft?.title,
      metaDescription: candidate.metaDescription ?? draft?.metaDescription,
      promptVersion: candidate.promptVersion,
      rewriteCandidate: undefined,
      rewritePending: undefined,
      rewriteHistory: history,
      lastRewriteError: undefined,
    };

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { draftData: nextDraft as object, errorMessage: null },
    });

    const ctx: LlmJobContext = {
      jobId,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
      brandVoice: enrichBrandVoiceForPrompt(job.site.brandVoice, job.site.settings) ?? undefined,
      contentLanguage: job.contentLanguage ?? job.site.contentLanguage ?? 'en',
    };

    if (options.rerunLocalSeo !== false) {
      await this.seoCheckerService.refreshLocalSeoScore(ctx);
    }

    let status = job.status;
    if (options.rerunSemrush !== false && process.env.SEMRUSH_ENABLED === 'true') {
      try {
        const triggered = await this.articleJobService.triggerSemrushCheck(
          organizationId,
          projectId,
          jobId,
        );
        status = triggered.status;
      } catch (error) {
        const message = this.resolveErrorMessage(error, 'Semrush 重新评分失败');
        this.logger.warn('Semrush check after rewrite accept failed', {
          traceId: job.traceId,
          jobId,
          action: 'article_job.rewrite_accept_semrush_failed',
          errorMessage: message,
        });
      }
    }

    this.logger.info('Manual AI rewrite accepted', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId,
      action: 'article_job.rewrite_accept',
      rerunLocalSeo: options.rerunLocalSeo !== false,
      rerunSemrush: options.rerunSemrush !== false,
    });

    return {
      id: job.id,
      traceId: job.traceId,
      status,
      targetKeyword: job.targetKeyword,
    };
  }

  async discardRewrite(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = job.draftData as DraftRewriteState | null;
    const candidate = draft?.rewriteCandidate;
    if (!candidate) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '没有可放弃的 AI 候选版本');
    }

    const history = this.appendHistory(draft?.rewriteHistory, {
      id: uuidv4(),
      mode: candidate.mode,
      status: 'discarded',
      instruction: candidate.instruction,
      changesSummary: candidate.changesSummary,
      createdAt: new Date().toISOString(),
    });

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...draft,
          rewriteCandidate: undefined,
          rewriteHistory: history,
        } as object,
      },
    });

    this.logger.info('Manual AI rewrite discarded', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId,
      action: 'article_job.rewrite_discard',
    });

    return {
      id: job.id,
      traceId: job.traceId,
      status: job.status,
      targetKeyword: job.targetKeyword,
    };
  }

  private async runManualRewrite(
    ctx: LlmJobContext,
    dto: RewriteArticleJobDto,
    content: string,
    draft: DraftRewriteState | null,
  ): Promise<void> {
    const suggestions =
      dto.mode === 'suggestions'
        ? (dto.suggestions?.filter((line) => line.trim().length > 0) ??
          (await this.collectDefaultSuggestions(ctx.jobId, ctx.organizationId, ctx.projectId)))
        : undefined;

    const result = await this.llmService.generateManualRewrite(ctx, {
      mode: dto.mode,
      content,
      suggestions,
      instruction: dto.instruction,
    });

    const keepTitleMeta = dto.options?.keepTitleMeta !== false;
    const candidate: RewriteCandidate = {
      content: result.content,
      title: keepTitleMeta ? draft?.title : undefined,
      metaDescription: keepTitleMeta ? draft?.metaDescription : undefined,
      changesSummary: result.changesSummary,
      warnings: result.warnings,
      promptVersion: result.promptVersion,
      generatedAt: new Date().toISOString(),
      mode: dto.mode,
      instruction: dto.instruction?.trim() || undefined,
    };

    const fresh = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const currentDraft = fresh?.draftData as DraftRewriteState | null;

    const history = this.appendHistory(currentDraft?.rewriteHistory, {
      id: uuidv4(),
      mode: dto.mode,
      status: 'completed',
      instruction: dto.instruction?.trim() || undefined,
      changesSummary: result.changesSummary,
      createdAt: candidate.generatedAt,
    });

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...currentDraft,
          rewriteCandidate: candidate,
          rewritePending: undefined,
          rewriteHistory: history,
          lastRewriteError: undefined,
        } as object,
        errorMessage: null,
      },
    });

    this.logger.info('Manual AI rewrite completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'article_job.rewrite_completed',
      mode: dto.mode,
      promptVersion: result.promptVersion,
    });
  }

  private async markRewriteFailed(ctx: LlmJobContext, message: string): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const draft = job?.draftData as DraftRewriteState | null;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...draft,
          rewritePending: undefined,
          lastRewriteError: message,
        } as object,
        errorMessage: message,
      },
    });

    this.logger.warn('Manual AI rewrite failed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'article_job.rewrite_failed',
      errorMessage: message,
    });
  }

  private async clearRewritePending(
    jobId: string,
    draft: DraftRewriteState | null,
    message: string,
  ): Promise<void> {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...draft,
          rewritePending: undefined,
          lastRewriteError: message,
        } as object,
      },
    });
  }

  private async collectDefaultSuggestions(
    jobId: string,
    organizationId: string,
    projectId: string,
  ): Promise<string[]> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { seoCheckData: true },
    });
    const check = (job?.seoCheckData ?? {}) as {
      local?: { suggestions?: string[] };
      semrush?: { suggestions?: string[] };
    };
    const lines = [...(check.local?.suggestions ?? []), ...(check.semrush?.suggestions ?? [])];
    return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].slice(0, 12);
  }

  private assertNoConflictingOps(
    status: string,
    draftData: unknown,
    seoCheckData: unknown,
  ): void {
    const pending = this.getRewritePending(draftData);
    if (pending && !isRewriteStale(pending.startedAt)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'AI 重写进行中，请稍候');
    }

    const semrushPending = this.getSemrushPending(seoCheckData);
    if (semrushPending && !isSemrushCheckStale(semrushPending.startedAt)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Semrush 检测进行中，请稍后再试');
    }

    if (status === 'OPTIMIZING' && semrushPending) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '任务优化进行中，请稍后再试');
    }
  }

  private getRewritePending(draftData: unknown): RewritePending | null {
    return (draftData as DraftRewriteState | null)?.rewritePending ?? null;
  }

  private getSemrushPending(seoCheckData: unknown): SemrushCheckPending | null {
    const data = (seoCheckData ?? {}) as { semrush?: { pending?: SemrushCheckPending } };
    return data.semrush?.pending ?? null;
  }

  private appendHistory(
    existing: RewriteHistoryEntry[] | undefined,
    entry: RewriteHistoryEntry,
  ): RewriteHistoryEntry[] {
    return [...(existing ?? []), entry].slice(-REWRITE_HISTORY_MAX);
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof BusinessException) {
      const body = error.getResponse();
      if (typeof body === 'object' && body !== null && 'message' in body) {
        return String((body as { message: string }).message);
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  }
}
