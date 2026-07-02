/**
 * 工作流编排器：调度 M1-M9 链路（SERP → Brief → 初稿 → 内链 → 配图 → Semrush → QuillBot → YMYL）。
 *
 * 边界：
 * - 不负责：具体外部 API（各子 Module + Provider）
 * - 不负责：计费入账（BillingService 监听 article.completed）
 *
 * 入口：
 * - WorkflowService
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  ARTICLE_BRIEF_PENDING_EVENT,
  ARTICLE_COMPLETED_EVENT,
  ARTICLE_FAILED_EVENT,
  type ArticleBriefPendingPayload,
  type ArticleCompletedPayload,
  type ArticleFailedPayload,
} from '../../../../core/event-bus/events';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  WORKFLOW_STEPS,
  withWorkflowMeta,
  resolveFailedStep,
  type WorkflowResumeStep,
} from '../../constants/workflow-resume';
import { normalizeSeoCheckDataForWrite } from '@wm/shared-core';
import { getWorkflowStepHandler } from './workflow-step.registry';
import { enrichBrandVoiceForPrompt } from '../../constants/site-settings';
import type { WorkflowStepContext } from './workflow-step.registry';
import { formatTargetMarketsForPrompt, primaryTargetMarket } from '../site/target-market.util';
import { isBriefApprovalPending, parseSiteWorkflowSettings } from '../../constants/brief-approval';
import { resolveSerpResearchOptions } from '../../constants/serp-research-settings';
import { ContentReviewService } from '../content-review/content-review.service';
import { IllustrationService } from '../illustration/illustration.service';
import { LinkingService } from '../linking/linking.service';
import { LlmService } from '../llm/llm.service';
import type { ArticleJobScraperOptions } from '../../processors/article-job.processor';
import { ParaphraseService } from '../paraphrase/paraphrase.service';
import { ScraperService } from '../scraper/scraper.service';
import { SeoCheckerService } from '../seo-checker/seo-checker.service';
import { ExportService } from '../export/export.service';

export interface WorkflowJobPayload {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scraperService: ScraperService,
    private readonly llmService: LlmService,
    private readonly seoCheckerService: SeoCheckerService,
    private readonly paraphraseService: ParaphraseService,
    private readonly contentReviewService: ContentReviewService,
    private readonly linkingService: LinkingService,
    private readonly illustrationService: IllustrationService,
    private readonly exportService: ExportService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: LoggerService,
  ) {}

  async runPhase1(
    jobId: string,
    traceId: string,
    organizationId: string,
    projectId: string,
    resumeFrom: WorkflowResumeStep = 'serp',
    scraperOptions?: ArticleJobScraperOptions,
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      include: {
        site: {
          select: {
            id: true,
            brandVoice: true,
            targetMarket: true,
            contentLanguage: true,
            settings: true,
          },
        },
      },
    });

    if (!job) {
      this.logger.warn('Workflow job not found', { traceId, jobId, organizationId, projectId });
      return;
    }
    if (String(job.status) === 'PAUSED') {
      this.logger.info('Workflow skipped because job is paused', {
        traceId,
        organizationId,
        projectId,
        jobId,
        action: 'workflow.paused_skip',
      });
      return;
    }

    const ctx = {
      jobId,
      traceId,
      organizationId,
      projectId,
      targetKeyword: job.targetKeyword,
      brandVoice: enrichBrandVoiceForPrompt(job.site.brandVoice, job.site.settings),
      targetMarket: formatTargetMarketsForPrompt(job.site.targetMarket) ?? primaryTargetMarket(job.site.targetMarket),
      contentLanguage: job.contentLanguage ?? job.site.contentLanguage ?? 'en',
    };

    const siteId = job.site.id;
    const siteWorkflow = parseSiteWorkflowSettings(job.site.settings);
    const startIdx = WORKFLOW_STEPS.indexOf(resumeFrom);
    const steps: Record<WorkflowResumeStep, () => Promise<void>> = {
      serp: async () => {
        /* migrated to WorkflowStepRegistrationService */
      },
      brief: async () => {
        /* migrated to WorkflowStepRegistrationService */
      },
      draft: async () => {
        // TODO: migrate to WorkflowStepRegistry
        await this.updateStatus(jobId, 'DRAFTING');
        await this.llmService.generateDraft(ctx);
      },
      linking: async () => {
        // TODO: migrate to WorkflowStepRegistry
        await this.updateStatus(jobId, 'LINKING');
        await this.linkingService.injectInternalLinksForJob({
          jobId: ctx.jobId,
          traceId: ctx.traceId,
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          siteId,
        });
      },
      images: async () => {
        // TODO: migrate to WorkflowStepRegistry
        if (!siteWorkflow.enableIllustration) {
          await this.illustrationService.enrichImagesForJob({
            jobId: ctx.jobId,
            traceId: ctx.traceId,
            organizationId: ctx.organizationId,
            projectId: ctx.projectId,
            siteId,
            targetKeyword: ctx.targetKeyword,
          });
          return;
        }
        await this.updateStatus(jobId, 'ILLUSTRATING');
        await this.illustrationService.enrichImagesForJob({
          jobId: ctx.jobId,
          traceId: ctx.traceId,
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          siteId,
          targetKeyword: ctx.targetKeyword,
        });
      },
      optimizing: async () => {
        // TODO: migrate to WorkflowStepRegistry
        await this.updateStatus(jobId, 'OPTIMIZING');
        await this.seoCheckerService.runPostDraftPipeline(ctx);
      },
      paraphrasing: async () => {
        // TODO: migrate to WorkflowStepRegistry
        await this.updateStatus(jobId, 'OPTIMIZING');
        await this.paraphraseService.runForJob(ctx);
      },
      ymyl: async () => {
        /* migrated to WorkflowStepRegistrationService */
      },
    };

    for (let i = startIdx; i < WORKFLOW_STEPS.length; i++) {
      const shouldStop = await this.shouldStopForPaused(jobId);
      if (shouldStop) {
        this.logger.info('Workflow interrupted by manual pause', {
          traceId,
          organizationId,
          projectId,
          jobId,
          action: 'workflow.paused_interrupt',
        });
        return;
      }

      const step = WORKFLOW_STEPS[i];
      const registered = getWorkflowStepHandler(step);
      if (registered) {
        await registered.run({ ...ctx, siteId, scraperOptions });
      } else {
        await steps[step]();
      }

      if (step === 'brief') {
        const paused = await this.shouldPauseForBriefApproval(jobId);
        if (paused) {
          const jobRow = await this.prisma.articleJob.findFirst({
            where: { id: jobId },
            select: { targetKeyword: true },
          });
          const briefPayload: ArticleBriefPendingPayload = {
            traceId,
            organizationId,
            projectId,
            jobId,
            targetKeyword: jobRow?.targetKeyword ?? '',
          };
          this.eventEmitter.emit(ARTICLE_BRIEF_PENDING_EVENT, briefPayload);
          this.logger.info('Workflow paused for brief approval', {
            traceId,
            organizationId,
            projectId,
            jobId,
            action: 'workflow.brief_paused',
          });
          return;
        }
      }
    }

    const outputUrl = await this.exportService.exportForJob({
      jobId,
      traceId,
      organizationId,
      projectId,
    });

    const latest = await this.prisma.articleJob.findFirst({
      where: { id: jobId },
      select: { seoCheckData: true },
    });
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        outputUrl,
        seoCheckData: normalizeSeoCheckDataForWrite(
          withWorkflowMeta(latest?.seoCheckData, null),
        ) as object,
      },
    });

    const payload: ArticleCompletedPayload = {
      traceId,
      organizationId,
      projectId,
      projectType: 'seo-factory',
      jobId,
      meterId: 'article.completed',
    };
    this.eventEmitter.emit(ARTICLE_COMPLETED_EVENT, payload);

    this.logger.info('Workflow completed', {
      traceId,
      organizationId,
      projectId,
      jobId,
      action: 'workflow.completed',
    });
  }

  async markFailed(
    jobId: string,
    traceId: string,
    organizationId: string,
    projectId: string,
    errorMessage: string,
  ): Promise<void> {
    const pausedRow = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { status: true },
    });
    if (String(pausedRow?.status ?? '') === 'PAUSED') {
      this.logger.info('Workflow failure suppressed because job is paused', {
        traceId,
        organizationId,
        projectId,
        jobId,
        action: 'workflow.failed_suppressed_paused',
        errorMessage,
      });
      return;
    }

    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        status: true,
        targetKeyword: true,
        briefData: true,
        draftData: true,
        seoCheckData: true,
        semrushScore: true,
      },
    });

    const failedStep = job ? resolveFailedStep(job) : 'serp';
    const prevCheck = (job?.seoCheckData ?? {}) as Record<string, unknown>;
    const suppressFailureNotification = prevCheck.suppressFailureNotification === true;

    await this.prisma.articleJob.updateMany({
      where: { id: jobId, organizationId, projectId },
      data: {
        status: 'FAILED',
        errorMessage,
        seoCheckData: {
          ...withWorkflowMeta(prevCheck, { failedStep }),
          suppressFailureNotification: false,
        } as object,
      },
    });

    this.logger.error('Workflow failed', {
      traceId,
      organizationId,
      projectId,
      jobId,
      action: 'workflow.failed',
      errorMessage,
      failedStep,
      notified: !suppressFailureNotification,
    });

    if (!suppressFailureNotification) {
      const failedPayload: ArticleFailedPayload = {
        traceId,
        organizationId,
        projectId,
        jobId,
        targetKeyword: job?.targetKeyword ?? '',
        errorMessage,
      };
      this.eventEmitter.emit(ARTICLE_FAILED_EVENT, failedPayload);
    }
  }

  async executeSerpStep(ctx: WorkflowStepContext): Promise<void> {
    await this.updateStatus(ctx.jobId, 'RESEARCHING');
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId },
      select: { site: { select: { settings: true, targetMarket: true } } },
    });
    if (!job?.site) return;
    const serp = resolveSerpResearchOptions(job.site.settings, ctx.scraperOptions, {
      targetMarket: job.site.targetMarket,
    });
    await this.scraperService.researchSerp({
      jobId: ctx.jobId,
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      targetKeyword: ctx.targetKeyword,
      targetMarket: serp.serpCountry,
      contentLanguage: ctx.contentLanguage,
      serpArticleLimit: serp.serpArticleLimit,
      serpArticlesOnly: serp.serpArticlesOnly,
      organicFetchNum: serp.organicFetchNum,
      minArticleCandidates: serp.minArticleCandidates,
      cacheTtlSeconds: serp.cacheTtlSeconds,
    });
  }

  async executeBriefStep(ctx: WorkflowStepContext): Promise<void> {
    await this.updateStatus(ctx.jobId, 'DRAFTING');
    await this.llmService.generateBrief(ctx);
  }

  async executeYmylStep(ctx: WorkflowStepContext): Promise<void> {
    await this.updateStatus(ctx.jobId, 'REVIEWING');
    await this.contentReviewService.runYmylReview({
      jobId: ctx.jobId,
      traceId: ctx.traceId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      targetKeyword: ctx.targetKeyword,
    });
  }

  private async shouldPauseForBriefApproval(jobId: string): Promise<boolean> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId },
      select: { briefData: true },
    });
    return isBriefApprovalPending(job?.briefData);
  }

  private async shouldStopForPaused(jobId: string): Promise<boolean> {
    const row = await this.prisma.articleJob.findFirst({
      where: { id: jobId },
      select: { status: true },
    });
    return String(row?.status ?? '') === 'PAUSED';
  }

  private async updateStatus(jobId: string, status: JobStatus | 'REVIEWING'): Promise<void> {
    // 若任务被手动暂停，不应再被工作流步骤覆盖状态。
    await this.prisma.articleJob.updateMany({
      where: {
        id: jobId,
        status: { not: 'PAUSED' as JobStatus },
      },
      data: { status: status as JobStatus },
    });
  }
}
