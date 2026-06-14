/**
 * LLM 网关服务：M4-M5 Brief 与初稿生成。
 *
 * 边界：
 * - 不负责：工作流编排、Prompt 文件存储（M12）
 *
 * 入口：
 * - LlmService
 */

import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER, type ILLMProvider } from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { buildOptimizeBriefContext } from './optimize-context.util';
import {
  formatOptimizeHistoryContext,
} from './optimize-history-context.util';

export interface LlmJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  targetKeyword: string;
  brandVoice?: string;
  contentLanguage?: string;
}

export interface GenerateOptimizeMeta {
  phase: 'local' | 'semrush';
  round: number;
  semrushCompetitorWordCount?: number;
  semrushCurrentWordCount?: number;
  semrushReadabilityScore?: number;
  localScore?: number;
  localScoreTarget?: number;
  localScoreBreakdown?: string;
  /** 本轮优化前分数（本地轮=本地分，Semrush 轮=Semrush 分） */
  scoreBefore?: number;
  /** 本轮仅聚焦的评分维度文案（英文） */
  focusDimensions?: string;
  readabilityPriority?: boolean;
  readabilityAudit?: string;
  pointsToGo?: number;
  scoreGapPlan?: string;
}

export interface OptimizeRoundBreakdown {
  keywordCoverage: number;
  serpTermAlignment: number;
  structure: number;
  readability: number;
  contentDepth: number;
}

export interface DraftOptimizeRound {
  phase: 'local' | 'semrush';
  round: number;
  /** baseline=初稿/初检快照，optimize=AI 优化轮 */
  kind?: 'baseline' | 'optimize';
  promptVersion?: string;
  changesSummary?: string[];
  warnings?: string[];
  optimizedAt: string;
  /** 该阶段主分数（本地轮=本地分 /10→/100，Semrush 轮=x/10） */
  scoreBefore?: number;
  scoreAfter?: number;
  /** Semrush 轮次后本地分（可能随改写变化） */
  localScoreAfter?: number;
  breakdownAfter?: OptimizeRoundBreakdown;
  /** 本轮改分下降，已回滚到历史最优稿 */
  rolledBack?: boolean;
  /** 回滚时候选稿主分（本地轮=本地分，Semrush 轮=Semrush 分） */
  candidateScoreAfter?: number;
  /** Semrush 轮回滚时候选稿本地分 */
  candidateLocalScoreAfter?: number;
  /** 回滚原因 */
  rollbackReason?: 'score_regressed' | 'local_below_threshold' | 'both';
}

export type ManualRewriteMode = 'suggestions' | 'instruction';

export interface ManualRewriteInput {
  mode: ManualRewriteMode;
  content: string;
  suggestions?: string[];
  instruction?: string;
  recommendedKeywords?: string[];
}

export interface ManualRewriteResult {
  content: string;
  promptVersion: string;
  changesSummary?: string[];
  warnings?: string[];
}

@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILLMProvider,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async generateBrief(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { serpData: true },
    });

    const brief = await this.llmProvider.generateBrief({
      keyword: ctx.targetKeyword,
      serpContext: job?.serpData ?? {},
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
    });

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: { briefData: brief as object },
    });

    this.logger.info('Brief generated', {
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      jobId: ctx.jobId,
      action: 'llm.generate_brief',
      promptVersion: brief.promptVersion,
    });
  }

  async generateDraft(ctx: LlmJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { briefData: true },
    });

    const briefData = job?.briefData as { outline?: unknown; promptVersion?: string } | null;
    const brief = {
      outline: briefData?.outline ?? {},
      promptVersion: briefData?.promptVersion ?? 'seo_brief_v1',
    };

    const draft = await this.llmProvider.generateDraft({
      keyword: ctx.targetKeyword,
      brief,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
    });

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: draft as object,
      },
    });

    this.logger.info('Draft generated', {
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      jobId: ctx.jobId,
      action: 'llm.generate_draft',
      promptVersion: draft.promptVersion,
    });
  }

  /** 按 SEO 评分建议优化初稿，返回新正文 */
  async generateOptimize(
    ctx: LlmJobContext,
    content: string,
    suggestions: string[],
    recommendedKeywords?: string[],
    meta?: GenerateOptimizeMeta,
  ): Promise<string> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { briefData: true, draftData: true },
    });

    const briefContext = buildOptimizeBriefContext(job?.briefData);
    const existingDraft = job?.draftData as {
      title?: string;
      metaDescription?: string;
      optimizeHistory?: DraftOptimizeRound[];
    } | null;

    const optimized = await this.llmProvider.generateOptimize({
      keyword: ctx.targetKeyword,
      content,
      suggestions,
      recommendedKeywords,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      optimizePhase: meta?.phase,
      briefSummary: briefContext.briefSummary,
      targetWordCount: briefContext.targetWordCount,
      searchIntent: briefContext.searchIntent,
      semrushCompetitorWordCount: meta?.semrushCompetitorWordCount,
      semrushCurrentWordCount: meta?.semrushCurrentWordCount,
      semrushReadabilityScore: meta?.semrushReadabilityScore,
      localScore: meta?.localScore,
      localScoreTarget: meta?.localScoreTarget,
      localScoreBreakdown: meta?.localScoreBreakdown,
      optimizeHistoryContext: formatOptimizeHistoryContext(
        existingDraft?.optimizeHistory,
        meta?.phase ?? 'local',
      ),
      focusDimensions:
        meta?.focusDimensions ??
        '(Address the lowest-scoring dimensions in the breakdown above.)',
      readabilityPriority: meta?.readabilityPriority,
      readabilityAudit: meta?.readabilityAudit,
      pointsToGo: meta?.pointsToGo,
      scoreGapPlan: meta?.scoreGapPlan,
    });

    const optimizeHistory = [...(existingDraft?.optimizeHistory ?? [])];
    if (meta) {
      optimizeHistory.push({
        phase: meta.phase,
        round: meta.round,
        kind: 'optimize',
        promptVersion: optimized.promptVersion,
        changesSummary: optimized.changesSummary,
        warnings: optimized.warnings,
        optimizedAt: new Date().toISOString(),
        scoreBefore: meta.scoreBefore ?? meta.localScore,
      });
    }

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          content: optimized.content,
          promptVersion: optimized.promptVersion,
          optimizeHistory,
        } as object,
      },
    });

    this.logger.info('Draft optimized for SEO', {
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      jobId: ctx.jobId,
      action: 'llm.generate_optimize',
      promptVersion: optimized.promptVersion,
      changesSummary: optimized.changesSummary,
      warnings: optimized.warnings,
      scoreBefore: meta?.scoreBefore ?? meta?.localScore,
    });

    return optimized.content;
  }

  /** 记录初稿/初检等基线分数 */
  async recordOptimizeSnapshot(
    ctx: LlmJobContext,
    entry: DraftOptimizeRound,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const existingDraft = (job?.draftData ?? {}) as { optimizeHistory?: DraftOptimizeRound[] };
    const optimizeHistory = [...(existingDraft.optimizeHistory ?? []), entry];

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          optimizeHistory,
        } as object,
      },
    });
  }

  /** 优化轮结束后写入优化后分数 */
  async patchLastOptimizeRound(
    ctx: LlmJobContext,
    match: { phase: 'local' | 'semrush'; round: number },
    patch: Pick<
      DraftOptimizeRound,
      | 'scoreAfter'
      | 'localScoreAfter'
      | 'breakdownAfter'
      | 'rolledBack'
      | 'candidateScoreAfter'
      | 'candidateLocalScoreAfter'
      | 'rollbackReason'
    >,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const existingDraft = (job?.draftData ?? {}) as { optimizeHistory?: DraftOptimizeRound[] };
    const optimizeHistory = [...(existingDraft.optimizeHistory ?? [])];
    let idx = -1;
    for (let i = optimizeHistory.length - 1; i >= 0; i -= 1) {
      const item = optimizeHistory[i];
      if (item.phase === match.phase && item.round === match.round && item.kind === 'optimize') {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;

    optimizeHistory[idx] = { ...optimizeHistory[idx], ...patch };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          optimizeHistory,
        } as object,
      },
    });
  }

  /** 优化轮改分下降时回滚正文到历史最优稿 */
  async revertDraftContent(ctx: LlmJobContext, content: string): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const existingDraft = (job?.draftData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          content,
        } as object,
      },
    });
  }

  /** 手动重写：仅调用 LLM，不写入数据库 */
  async generateManualRewrite(
    ctx: LlmJobContext,
    input: ManualRewriteInput,
  ): Promise<ManualRewriteResult> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { briefData: true },
    });

    const briefContext = buildOptimizeBriefContext(job?.briefData);

    if (input.mode === 'instruction') {
      const instruction = input.instruction?.trim();
      if (!instruction) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写改写指令');
      }

      const rewritten = await this.llmProvider.generateRewrite({
        keyword: ctx.targetKeyword,
        content: input.content,
        instruction,
        brandVoice: ctx.brandVoice,
        contentLanguage: ctx.contentLanguage,
        briefSummary: briefContext.briefSummary,
        targetWordCount: briefContext.targetWordCount,
        searchIntent: briefContext.searchIntent,
      });

      return rewritten;
    }

    const suggestions = input.suggestions?.filter((line) => line.trim().length > 0) ?? [];
    if (suggestions.length === 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请至少选择一条优化建议');
    }

    const optimized = await this.llmProvider.generateOptimize({
      keyword: ctx.targetKeyword,
      content: input.content,
      suggestions,
      recommendedKeywords: input.recommendedKeywords,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      briefSummary: briefContext.briefSummary,
      targetWordCount: briefContext.targetWordCount,
      searchIntent: briefContext.searchIntent,
    });

    return optimized;
  }
}
