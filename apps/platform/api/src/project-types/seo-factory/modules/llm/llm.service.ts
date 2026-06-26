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
import { enforceArticleH1Boundary, validateAndFixSemrushStructure, countWords } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { parseSiteWorkflowSettings, withBriefApproval } from '../../constants/brief-approval';
import {
  getSearchIntentGuidelines,
  normalizeKeywordIntent,
  searchIntentPromptLabel,
} from '../../constants/search-intent';
import {
  contentFormPromptLabel,
  getContentFormGuidelines,
  normalizeArticleContentForm,
} from '../../constants/content-form';
import { resolveClusterPromptContext } from '../keyword-pool/cluster-prompt-context.util';
import { buildOptimizeBriefContext, resolveOptimizeWordCountTarget } from './optimize-context.util';
import {
  logSeoPipelineFlow,
  summarizeFlowKeywords,
} from '../../utils/seo-pipeline-flow-log.util';
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
  /** Semrush 评测线路（3ue 节点） */
  semrushEvaluationRoute?: string;
  semrushCompetitorWordCount?: number;
  semrushCurrentWordCount?: number;
  semrushLocalExpandWordTarget?: number;
  localWordCount?: number;
  semrushReadabilityScore?: number;
  localScore?: number;
  localScoreTarget?: number;
  localScoreBreakdown?: string;
  /** 本轮优化前分数（本地轮=本地分，Semrush 轮=Semrush 分） */
  scoreBefore?: number;
  /** 本轮仅聚焦的评分维度文案（英文） */
  focusDimensions?: string;
  readabilityPriority?: boolean;
  serpPriority?: boolean;
  fleschPriority?: boolean;
  hardSentencePriority?: boolean;
  titlePriority?: boolean;
  wordCountTrimPriority?: boolean;
  wordCountExpandPriority?: boolean;
  articleTitle?: string;
  readabilityAudit?: string;
  pointsToGo?: number;
  scoreGapPlan?: string;
  contentCoverageMaxed?: boolean;
  serpCoverageMaxed?: boolean;
  keywordDensityFocus?: boolean;
  /** 已命中的 SEO 短语，可读性优化轮禁止删改 */
  protectedSeoPhrases?: string[];
  /** 本地对齐 Sem：LLM 以预测 Semrush 0–10 为优化目标 */
  calibratedLocalAlign?: boolean;
  predictedSemrush?: number;
  predictedSemrushTarget?: number;
  /** 调试字段：Semrush 本轮路由动作 */
  roundAction?: 'semrush_keyword_first' | 'semrush_surgical' | 'semrush_optimize';
  /** 调试字段：Semrush 本轮关键词批次 */
  keywordBatch?: string[];
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
  /** Semrush 轮对应的 3ue 评测线路（节点） */
  semrushEvaluationRoute?: string;
  promptVersion?: string;
  changesSummary?: string[];
  warnings?: string[];
  optimizedAt: string;
  /** 该阶段主分数（本地轮=本地分 /10→/100，Semrush 轮=x/10） */
  scoreBefore?: number;
  scoreAfter?: number;
  /** 本地对齐轮：校准预测 Semrush（0–10） */
  predictedSemrushBefore?: number;
  predictedSemrushAfter?: number;
  /** 回滚时候选稿预测 Semrush */
  candidatePredictedSemrush?: number;
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
  rollbackReason?:
    | 'score_regressed'
    | 'predicted_semrush_regressed'
    | 'keyword_coverage_regressed'
    | 'target_keyword_regressed'
    | 'local_below_threshold'
    | 'both';
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
      select: {
        serpData: true,
        searchIntent: true,
        contentForm: true,
        site: { select: { settings: true } },
      },
    });

    const intent = normalizeKeywordIntent(job?.searchIntent);
    const contentForm = normalizeArticleContentForm(job?.contentForm);
    const clusterContext = await resolveClusterPromptContext(
      this.prisma,
      ctx.organizationId,
      ctx.projectId,
      ctx.targetKeyword,
    );

    const brief = await this.llmProvider.generateBrief({
      keyword: ctx.targetKeyword,
      serpContext: job?.serpData ?? {},
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      searchIntent: searchIntentPromptLabel(intent),
      intentGuidelines: getSearchIntentGuidelines(intent),
      contentForm: contentFormPromptLabel(contentForm),
      contentFormGuidelines: getContentFormGuidelines(contentForm),
      clusterContext,
    });

    const requireApproval = parseSiteWorkflowSettings(job?.site?.settings).requireBriefApproval;
    const briefData = withBriefApproval(brief, {
      approvalStatus: requireApproval ? 'pending' : 'skipped',
    });

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: { briefData: briefData as object },
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
      select: { briefData: true, searchIntent: true, contentForm: true },
    });

    const briefData = job?.briefData as { outline?: unknown; promptVersion?: string } | null;
    const brief = {
      outline: briefData?.outline ?? {},
      promptVersion: briefData?.promptVersion ?? 'seo_brief_v1',
    };

    const intent = normalizeKeywordIntent(job?.searchIntent);
    const contentForm = normalizeArticleContentForm(job?.contentForm);
    const clusterContext = await resolveClusterPromptContext(
      this.prisma,
      ctx.organizationId,
      ctx.projectId,
      ctx.targetKeyword,
    );

    const draft = await this.llmProvider.generateDraft({
      keyword: ctx.targetKeyword,
      brief,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      searchIntent: searchIntentPromptLabel(intent),
      intentGuidelines: getSearchIntentGuidelines(intent),
      contentForm: contentFormPromptLabel(contentForm),
      contentFormGuidelines: getContentFormGuidelines(contentForm),
      clusterContext,
    });
    const sourceContent = enforceArticleH1Boundary(
      draft.content,
      draft.title?.trim() || ctx.targetKeyword,
    );
    const formatRepair = validateAndFixSemrushStructure(sourceContent);
    const normalizedTitle = formatRepair.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? draft.title;
    const normalizedDraft = {
      ...draft,
      title: normalizedTitle,
      content: formatRepair.content,
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: normalizedDraft as object,
      },
    });

    this.logger.info('Draft generated', {
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      jobId: ctx.jobId,
      action: 'llm.generate_draft',
      promptVersion: normalizedDraft.promptVersion,
      formatRepairs: formatRepair.errors,
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
    const effectiveTargetWordCount = resolveOptimizeWordCountTarget(
      briefContext.targetWordCount,
      meta?.semrushCompetitorWordCount,
    );
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
      targetWordCount: effectiveTargetWordCount,
      searchIntent: briefContext.searchIntent,
      semrushCompetitorWordCount: meta?.semrushCompetitorWordCount,
      semrushCurrentWordCount: meta?.semrushCurrentWordCount,
      semrushLocalExpandWordTarget: meta?.semrushLocalExpandWordTarget,
      localWordCount: meta?.localWordCount,
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
      serpPriority: meta?.serpPriority,
      fleschPriority: meta?.fleschPriority,
      hardSentencePriority: meta?.hardSentencePriority,
      titlePriority: meta?.titlePriority,
      wordCountTrimPriority: meta?.wordCountTrimPriority,
      wordCountExpandPriority: meta?.wordCountExpandPriority,
      articleTitle: meta?.articleTitle,
      readabilityAudit: meta?.readabilityAudit,
      pointsToGo: meta?.pointsToGo,
      scoreGapPlan: meta?.scoreGapPlan,
      contentCoverageMaxed: meta?.contentCoverageMaxed,
      serpCoverageMaxed: meta?.serpCoverageMaxed,
      keywordDensityFocus: meta?.keywordDensityFocus,
      protectedSeoPhrases: meta?.protectedSeoPhrases,
      calibratedLocalAlign: meta?.calibratedLocalAlign,
      predictedSemrush: meta?.predictedSemrush,
      predictedSemrushTarget: meta?.predictedSemrushTarget,
      roundAction: meta?.roundAction,
      keywordBatch: meta?.keywordBatch,
    });

    const formatRepair = validateAndFixSemrushStructure(
      enforceArticleH1Boundary(optimized.content, existingDraft?.title),
    );
    const normalizedContent = formatRepair.content;
    const optimizeHistory = [...(existingDraft?.optimizeHistory ?? [])];
    if (meta) {
      optimizeHistory.push({
        phase: meta.phase,
        round: meta.round,
        kind: 'optimize',
        semrushEvaluationRoute: meta.semrushEvaluationRoute,
        promptVersion: optimized.promptVersion,
        changesSummary: optimized.changesSummary,
        warnings: optimized.warnings,
        optimizedAt: new Date().toISOString(),
        scoreBefore: meta.scoreBefore ?? meta.localScore,
        predictedSemrushBefore:
          meta.calibratedLocalAlign === true && typeof meta.predictedSemrush === 'number'
            ? meta.predictedSemrush
            : undefined,
      });
    }

    const h1Title = normalizedContent.match(/^#\s+(.+)$/m)?.[1]?.trim();
    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          content: normalizedContent,
          ...(meta?.titlePriority === true && h1Title ? { title: h1Title } : {}),
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
      formatRepairs: formatRepair.errors,
      scoreBefore: meta?.scoreBefore ?? meta?.localScore,
      phase: meta?.phase,
      round: meta?.round,
    });
    logSeoPipelineFlow(
      this.logger,
      {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
      },
      'pipeline.llm_optimize_done',
      {
        phase: meta?.phase ?? 'local',
        round: meta?.round,
        roundAction: meta?.roundAction,
        promptVersion: optimized.promptVersion,
        recommendedKeywordCount: recommendedKeywords?.length ?? 0,
        recommendedKeywords: summarizeFlowKeywords(recommendedKeywords),
        keywordBatch: summarizeFlowKeywords(meta?.keywordBatch),
        readabilityPriority: meta?.readabilityPriority,
        wordCountExpandPriority: meta?.wordCountExpandPriority,
        wordCountTrimPriority: meta?.wordCountTrimPriority,
        serpPriority: meta?.serpPriority,
        wordCountBefore: countWords(content),
        wordCountAfter: countWords(normalizedContent),
        changesSummary: optimized.changesSummary,
        warnings: optimized.warnings,
      },
    );

    return normalizedContent;
  }

  /** Semrush 8.8–8.9 手术式改写：只改侧栏点名的句子和词，避免整篇 optimize 降分 */
  async generateSemrushNearMissRewrite(
    ctx: LlmJobContext,
    content: string,
    instruction: string,
    meta: Pick<
      GenerateOptimizeMeta,
      'round' | 'scoreBefore' | 'localScore' | 'phase' | 'semrushEvaluationRoute'
    >,
  ): Promise<string> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { briefData: true, draftData: true },
    });

    const briefContext = buildOptimizeBriefContext(job?.briefData);
    const existingDraft = job?.draftData as {
      title?: string;
      optimizeHistory?: DraftOptimizeRound[];
    } | null;

    const rewritten = await this.llmProvider.generateRewrite({
      keyword: ctx.targetKeyword,
      content,
      instruction,
      brandVoice: ctx.brandVoice,
      contentLanguage: ctx.contentLanguage,
      briefSummary: briefContext.briefSummary,
      targetWordCount: briefContext.targetWordCount,
      searchIntent: briefContext.searchIntent,
    });

    const formatRepair = validateAndFixSemrushStructure(
      enforceArticleH1Boundary(rewritten.content, existingDraft?.title),
    );
    const normalizedContent = formatRepair.content;
    const optimizeHistory = [...(existingDraft?.optimizeHistory ?? [])];
    optimizeHistory.push({
      phase: meta.phase,
      round: meta.round,
      kind: 'optimize',
      semrushEvaluationRoute: meta.semrushEvaluationRoute,
      promptVersion: rewritten.promptVersion,
      changesSummary: rewritten.changesSummary,
      warnings: rewritten.warnings,
      optimizedAt: new Date().toISOString(),
      scoreBefore: meta.scoreBefore ?? meta.localScore,
    });

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          content: normalizedContent,
          promptVersion: rewritten.promptVersion,
          optimizeHistory,
        } as object,
      },
    });

    this.logger.info('Semrush near-miss surgical rewrite', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'llm.semrush_near_miss_rewrite',
      round: meta.round,
      changesSummary: rewritten.changesSummary,
      formatRepairs: formatRepair.errors,
    });

    return normalizedContent;
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
      | 'predictedSemrushAfter'
      | 'candidatePredictedSemrush'
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

      const originalTitle = input.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
      const formatRepair = validateAndFixSemrushStructure(
        enforceArticleH1Boundary(rewritten.content, originalTitle),
      );
      return {
        ...rewritten,
        content: formatRepair.content,
        warnings: [
          ...(rewritten.warnings ?? []),
          ...formatRepair.errors.map((error) => `format_repaired:${error}`),
        ],
      };
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

    const originalTitle = input.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const formatRepair = validateAndFixSemrushStructure(
      enforceArticleH1Boundary(optimized.content, originalTitle),
    );
    return {
      ...optimized,
      content: formatRepair.content,
      warnings: [
        ...(optimized.warnings ?? []),
        ...formatRepair.errors.map((error) => `format_repaired:${error}`),
      ],
    };
  }
}
