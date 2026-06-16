/**
 * 文章任务稿件手动编辑：保存、历史、回滚。
 *
 * 边界：
 * - 不负责：LLM 重写（ArticleJobRewriteService）
 *
 * 入口：
 * - ArticleJobDraftEditService
 */

import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { RequestContext } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  EDITABLE_JOB_STATUSES,
  MANUAL_EDIT_HISTORY_MAX,
  type DraftPostSaveAction,
  type DraftStaleness,
  type ManualEditHistoryEntry,
} from '../../constants/draft-edit';
import { isRewriteStale, type RewritePending } from '../../constants/rewrite';
import { isSemrushCheckStale, type SemrushCheckPending } from '../../constants/semrush-check';
import { enrichBrandVoiceForPrompt } from '../../constants/site-settings';
import { canPublishArticle, detectYmylContent, getYmylReview } from '../content-review/ymyl-detect.util';
import { ExportService } from '../export/export.service';
import type { LlmJobContext } from '../llm/llm.service';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import {
  buildChangeSummary,
  clearStalenessAffected,
  computeDraftStaleness,
  type DraftEditFields,
} from './draft-edit.util';
import type { PatchArticleDraftDto } from './dto/patch-article-draft.dto';
import type { RollbackArticleDraftDto } from './dto/patch-article-draft.dto';
import type { ResolveDraftStaleDto } from './dto/resolve-draft-stale.dto';
import { ArticleJobService } from './article-job.service';

interface DraftEditState extends DraftEditFields {
  contentVersion?: number;
  staleness?: DraftStaleness | null;
  manualEditHistory?: ManualEditHistoryEntry[];
  rewritePending?: RewritePending;
  rewriteCandidate?: { content?: string };
  paraphraseApplied?: boolean;
  promptVersion?: string;
  optimizeHistory?: unknown;
  internalLinks?: unknown;
  internalLinksApplied?: boolean;
  articleImages?: unknown;
  imagesApplied?: boolean;
}

@Injectable()
export class ArticleJobDraftEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly articleJobService: ArticleJobService,
    private readonly exportService: ExportService,
  ) {}

  async patchDraft(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: PatchArticleDraftDto,
  ) {
    const job = await this.loadEditableJob(organizationId, projectId, jobId);
    const draft = (job.draftData ?? {}) as DraftEditState;
    const currentVersion = draft.contentVersion ?? 0;

    if (dto.contentVersion !== currentVersion) {
      throw new BusinessException(
        ErrorCodes.DRAFT_VERSION_CONFLICT,
        '内容已被他人修改，请刷新后重试',
        undefined,
        HttpStatus.CONFLICT,
      );
    }

    const before: DraftEditFields = {
      title: draft.title,
      metaDescription: draft.metaDescription,
      content: draft.content,
    };

    const after: DraftEditFields = {
      title: dto.title !== undefined ? dto.title.trim() : draft.title,
      metaDescription:
        dto.metaDescription !== undefined ? dto.metaDescription.trim() : draft.metaDescription,
      content: dto.content !== undefined ? dto.content.trim() : draft.content,
    };

    if (!after.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文不能为空');
    }

    const stalenessResult = computeDraftStaleness(before, after);
    if (!stalenessResult) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '内容无变更');
    }

    const postSaveAction: DraftPostSaveAction = dto.postSaveAction ?? 'refresh_local';
    const staleness: DraftStaleness = {
      contentChanged: stalenessResult.contentChanged,
      titleMetaChanged: stalenessResult.titleMetaChanged,
      invalidatedAt: new Date().toISOString(),
      invalidatedBy: ctx.userId,
      affected: stalenessResult.affected,
      postSaveAction,
    };

    const historyEntry: ManualEditHistoryEntry = {
      id: uuidv4(),
      editedAt: new Date().toISOString(),
      editedBy: ctx.userId,
      changeSummary: buildChangeSummary(before, after),
      snapshot: {
        title: before.title,
        metaDescription: before.metaDescription,
        content: before.content ?? '',
      },
      postSaveAction,
      staleness: stalenessResult.affected,
    };

    const nextDraft: DraftEditState = {
      ...draft,
      ...after,
      contentVersion: currentVersion + 1,
      staleness,
      manualEditHistory: this.appendHistory(draft.manualEditHistory, historyEntry),
    };

    if (stalenessResult.affected.paraphrase) {
      nextDraft.paraphraseApplied = false;
    }

    const seoCheckData = this.applySeoInvalidations(
      job.seoCheckData,
      job.briefData,
      job.targetKeyword,
      after,
      stalenessResult.affected,
    );

    const updateData: Record<string, unknown> = {
      draftData: nextDraft as object,
      seoCheckData: seoCheckData as object,
      errorMessage: null,
    };

    if (stalenessResult.affected.localSeo) {
      updateData.localSeoScore = null;
    }
    if (stalenessResult.affected.semrush) {
      updateData.semrushScore = null;
    }
    if (stalenessResult.affected.export) {
      updateData.outputUrl = null;
    }

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: updateData,
    });

    this.logger.info('Manual draft edit saved', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId,
      action: 'article_job.manual_edit',
      userId: ctx.userId,
      postSaveAction,
      contentVersion: nextDraft.contentVersion,
    });

    await this.runPostSaveAction(
      {
        jobId,
        traceId: job.traceId,
        organizationId,
        projectId,
        targetKeyword: job.targetKeyword,
        brandVoice: enrichBrandVoiceForPrompt(job.site.brandVoice, job.site.settings) ?? undefined,
        contentLanguage: job.contentLanguage ?? job.site.contentLanguage ?? 'en',
      },
      postSaveAction,
    );

    return this.loadResult(organizationId, projectId, jobId);
  }

  /** 编辑后 Banner 快捷操作：重算本地 SEO / 重跑 Semrush / 重新生成导出 */
  async resolveStaleAction(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: ResolveDraftStaleDto,
  ) {
    const job = await this.loadEditableJob(organizationId, projectId, jobId);
    const draft = (job.draftData ?? {}) as DraftEditState;
    if (!draft.staleness) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '当前无待处理的编辑失效项');
    }

    const llmCtx: LlmJobContext = {
      jobId,
      traceId: job.traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
      brandVoice: enrichBrandVoiceForPrompt(job.site.brandVoice, job.site.settings) ?? undefined,
      contentLanguage: job.contentLanguage ?? job.site.contentLanguage ?? 'en',
    };

    if (dto.action === 'refresh_local') {
      if (!draft.staleness.affected.localSeo) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '本地 SEO 分未标记失效');
      }
      await this.seoCheckerService.refreshLocalSeoScore(llmCtx);
      await this.applyStalenessClear(jobId, draft, ['localSeo'], job.seoCheckData);
    } else if (dto.action === 'rerun_semrush') {
      if (!draft.staleness.affected.semrush) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Semrush 分未标记失效');
      }
      await this.seoCheckerService.refreshLocalSeoScore(llmCtx);
      await this.applyStalenessClear(jobId, draft, ['localSeo'], job.seoCheckData);
      if (process.env.SEMRUSH_ENABLED !== 'true') {
        throw new BusinessException(
          ErrorCodes.VALIDATION_ERROR,
          'Semrush 未启用，请在 apps/platform/api/.env 设置 SEMRUSH_ENABLED=true',
        );
      }
      await this.articleJobService.triggerSemrushCheck(organizationId, projectId, jobId);
    } else if (dto.action === 'regenerate_export') {
      if (!draft.staleness.affected.export) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '导出物未标记失效');
      }
      const fresh = await this.prisma.articleJob.findFirst({
        where: { id: jobId, organizationId, projectId },
        select: { seoCheckData: true },
      });
      if (!canPublishArticle(fresh?.seoCheckData)) {
        throw new BusinessException(
          ErrorCodes.JOB_NOT_PUBLISHABLE,
          'YMYL 需人工审核通过后才能重新生成可发布 HTML',
        );
      }
      const outputUrl = await this.exportService.exportForJob({
        jobId,
        traceId: job.traceId,
        organizationId,
        projectId,
      });
      if (!outputUrl) {
        throw new BusinessException(ErrorCodes.JOB_NOT_PUBLISHABLE, '导出生成失败，请检查稿件与 YMYL 状态');
      }
      await this.prisma.articleJob.update({
        where: { id: jobId },
        data: { outputUrl },
      });
      await this.applyStalenessClear(jobId, draft, ['export'], fresh?.seoCheckData);
    }

    this.logger.info('Draft stale resolved', {
      traceId: job.traceId,
      organizationId,
      projectId,
      jobId,
      action: `articleJob.draft_resolve_stale.${dto.action}`,
      userId: ctx.userId,
    });

    return this.loadResult(organizationId, projectId, jobId);
  }

  private async applyStalenessClear(
    jobId: string,
    draft: DraftEditState,
    keys: Array<keyof DraftStaleness['affected']>,
    seoCheckData: unknown,
  ): Promise<void> {
    const nextStaleness = clearStalenessAffected(draft.staleness, keys);
    const prevCheck = (seoCheckData ?? {}) as Record<string, unknown>;
    const nextCheck = { ...prevCheck };

    if (keys.includes('localSeo') && nextCheck.local) {
      nextCheck.local = { ...(nextCheck.local as Record<string, unknown>), stale: false };
    }
    if (keys.includes('semrush') && nextCheck.semrush) {
      nextCheck.semrush = { ...(nextCheck.semrush as Record<string, unknown>), stale: false };
    }

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: { ...draft, staleness: nextStaleness } as object,
        seoCheckData: nextCheck as object,
      },
    });
  }

  async listEditHistory(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { draftData: true, traceId: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = (job.draftData ?? {}) as DraftEditState;
    const items = [...(draft.manualEditHistory ?? [])].reverse();

    return { items, contentVersion: draft.contentVersion ?? 0 };
  }

  /** 供插图上传等场景校验稿件是否可编辑 */
  async assertDraftEditable(organizationId: string, projectId: string, jobId: string): Promise<void> {
    await this.loadEditableJob(organizationId, projectId, jobId);
  }

  async rollbackDraft(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: RollbackArticleDraftDto,
  ) {
    const job = await this.loadEditableJob(organizationId, projectId, jobId);
    const draft = (job.draftData ?? {}) as DraftEditState;
    const entry = draft.manualEditHistory?.find((row) => row.id === dto.historyId);

    if (!entry) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '编辑历史不存在');
    }

    return this.patchDraft(ctx, organizationId, projectId, jobId, {
      title: entry.snapshot.title,
      metaDescription: entry.snapshot.metaDescription,
      content: entry.snapshot.content,
      contentVersion: draft.contentVersion ?? 0,
      postSaveAction: dto.postSaveAction ?? 'refresh_local',
      clientChangeNote: `回滚至 ${entry.editedAt}`,
    });
  }

  private async loadEditableJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        seoCheckData: true,
        briefData: true,
        contentLanguage: true,
        site: { select: { brandVoice: true, contentLanguage: true, settings: true } },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = job.draftData as DraftEditState | null;
    if (!draft?.content?.trim()) {
      throw new BusinessException(ErrorCodes.DRAFT_NOT_EDITABLE, '尚无初稿正文，无法编辑');
    }

    if (!EDITABLE_JOB_STATUSES.includes(job.status as (typeof EDITABLE_JOB_STATUSES)[number])) {
      throw new BusinessException(ErrorCodes.DRAFT_NOT_EDITABLE, '当前任务状态不允许编辑');
    }

    this.assertEditable(job.status, job.draftData, job.seoCheckData);
    return job;
  }

  private assertEditable(status: string, draftData: unknown, seoCheckData: unknown): void {
    const draft = draftData as DraftEditState | null;
    const pending = draft?.rewritePending;
    if (pending && !isRewriteStale(pending.startedAt)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'AI 重写进行中，请稍候');
    }

    if (draft?.rewriteCandidate?.content?.trim()) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '请先采纳或放弃当前 AI 候选版本',
      );
    }

    const semrushPending = this.getSemrushPending(seoCheckData);
    if (semrushPending && !isSemrushCheckStale(semrushPending.startedAt)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Semrush 检测进行中，请稍后再试');
    }

    if (status === 'OPTIMIZING' && semrushPending) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '任务优化进行中，请稍后再试');
    }
  }

  private getSemrushPending(seoCheckData: unknown): SemrushCheckPending | null {
    const data = (seoCheckData ?? {}) as { semrush?: { pending?: SemrushCheckPending } };
    return data.semrush?.pending ?? null;
  }

  private applySeoInvalidations(
    seoCheckData: unknown,
    briefData: unknown,
    targetKeyword: string,
    after: DraftEditFields,
    affected: DraftStaleness['affected'],
  ): Record<string, unknown> {
    const base = { ...((seoCheckData ?? {}) as Record<string, unknown>) };
    const next = { ...base };

    if (affected.localSeo && next.local) {
      next.local = {
        ...(next.local as Record<string, unknown>),
        stale: true,
        passed: false,
      };
    }

    if (affected.semrush && next.semrush) {
      next.semrush = {
        ...(next.semrush as Record<string, unknown>),
        stale: true,
        passed: false,
      };
    }

    if (affected.paraphrase && next.quillbot) {
      next.quillbot = {
        ...(next.quillbot as Record<string, unknown>),
        stale: true,
      };
    }

    if (affected.ymyl) {
      const brief = briefData as {
        title?: string;
        outline?: { sections?: Array<{ heading?: string; summary?: string }> };
      } | null;
      const briefText = [
        brief?.title,
        ...(brief?.outline?.sections ?? []).flatMap((section) => [
          section.heading,
          section.summary,
        ]),
      ]
        .filter(Boolean)
        .join('\n');

      const review = detectYmylContent({
        targetKeyword,
        briefText,
        content: after.content,
      });

      const previous = getYmylReview(seoCheckData);
      if (previous?.humanReviewStatus === 'approved') {
        review.humanReviewStatus = 'pending';
        review.humanReviewNote = undefined;
        review.humanReviewedAt = undefined;
        review.humanReviewedBy = undefined;
      } else if (previous?.humanReviewStatus === 'rejected') {
        review.humanReviewStatus = 'pending';
      } else if (review.requires_human_review) {
        review.humanReviewStatus = 'pending';
      }

      next.ymylReview = review;
    }

    return next;
  }

  private async runPostSaveAction(ctx: LlmJobContext, action: DraftPostSaveAction): Promise<void> {
    if (action === 'none') return;

    if (action === 'refresh_local') {
      await this.seoCheckerService.refreshLocalSeoScore(ctx);
      await this.clearStalenessAfterPostSave(ctx.jobId, ['localSeo']);
      return;
    }

    if (action === 'rerun_from_optimizing') {
      await this.seoCheckerService.refreshLocalSeoScore(ctx);
      await this.clearStalenessAfterPostSave(ctx.jobId, ['localSeo']);
      if (process.env.SEMRUSH_ENABLED === 'true') {
        try {
          await this.articleJobService.triggerSemrushCheck(
            ctx.organizationId,
            ctx.projectId,
            ctx.jobId,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Semrush 重新评分失败';
          this.logger.warn('Semrush check after manual edit failed', {
            traceId: ctx.traceId,
            jobId: ctx.jobId,
            action: 'article_job.manual_edit_semrush_failed',
            errorMessage: message,
          });
        }
      }
    }
  }

  private async clearStalenessAfterPostSave(
    jobId: string,
    keys: Array<keyof DraftStaleness['affected']>,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId },
      select: { draftData: true, seoCheckData: true },
    });
    const draft = (job?.draftData ?? {}) as DraftEditState;
    if (!draft.staleness) return;
    await this.applyStalenessClear(jobId, draft, keys, job?.seoCheckData);
  }

  private appendHistory(
    existing: ManualEditHistoryEntry[] | undefined,
    entry: ManualEditHistoryEntry,
  ): ManualEditHistoryEntry[] {
    return [...(existing ?? []), entry].slice(-MANUAL_EDIT_HISTORY_MAX);
  }

  private async loadResult(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
        localSeoScore: true,
        semrushScore: true,
        outputUrl: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draft = (job.draftData ?? {}) as DraftEditState;

    return {
      ...job,
      staleness: draft.staleness ?? null,
      contentVersion: draft.contentVersion ?? 0,
    };
  }
}
