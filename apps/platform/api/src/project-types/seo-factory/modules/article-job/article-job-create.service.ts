/**
 * 文章任务创建与失败重试入队。
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { normalizeContentLanguage } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { normalizeKeywordIntent, type KeywordIntentValue } from '../../constants/search-intent';
import { normalizeArticleContentForm } from '../../constants/content-form';
import type { CreateArticleJobDto } from './dto/create-article-job.dto';
import { resolveSerpResearchOptions } from '../../constants/serp-research-settings';
import {
  buildArticleJobScraperOptions,
  getArticleJobConfig,
  withArticleJobConfig,
} from '../../constants/article-job-config';
import { resolveResumeStep, withWorkflowMeta } from '../../constants/workflow-resume';
import { BillingService } from '../../../../modules/billing/billing.service';
import { findKeywordConflicts } from '../keyword-pool/keyword-cannibalization.util';
import { ArticleJobQueueService } from './article-job-queue.service';
import { buildArticleJobScraperOptionsFromDto } from './article-job-scraper.util';

@Injectable()
export class ArticleJobCreateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly billingService: BillingService,
    private readonly queueService: ArticleJobQueueService,
  ) {}

  async create(organizationId: string, projectId: string, dto: CreateArticleJobDto) {
    await this.billingService.assertArticleQuota(organizationId, 1);

    const traceId = `tr_${uuidv4()}`;

    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, projectId },
      select: { id: true, contentLanguage: true, targetMarket: true, settings: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const contentLanguage = normalizeContentLanguage(
      dto.contentLanguage ?? site.contentLanguage,
    );

    const searchIntent = await this.resolveSearchIntent(
      organizationId,
      projectId,
      dto.targetKeyword,
      dto.searchIntent,
    );

    const serpCountry = this.resolveJobSerpCountry(site, dto.serpCountry);

    const job = await this.prisma.articleJob.create({
      data: {
        traceId,
        organizationId,
        projectId,
        siteId: dto.siteId,
        targetKeyword: dto.targetKeyword,
        contentLanguage,
        searchIntent,
        contentForm: normalizeArticleContentForm(dto.contentForm),
        status: 'QUEUED',
        seoCheckData: withArticleJobConfig(null, { serpCountry }) as object,
      },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        createdAt: true,
      },
    });

    const scraperOptions = buildArticleJobScraperOptionsFromDto(dto, serpCountry);

    try {
      await this.queueService.enqueueArticleJob(
        {
          jobId: job.id,
          traceId,
          organizationId,
          projectId,
          scraperOptions,
        },
        traceId,
      );
    } catch (error) {
      await this.compensateEnqueueFailure(job.id, '入队失败，请稍后重试');
      throw error;
    }

    this.logger.info('Article job created and enqueued', {
      traceId,
      organizationId,
      projectId,
      jobId: job.id,
      action: 'article_job.create',
      scraperOptions,
    });

    const warnings = await this.buildKeywordCannibalizationWarnings(
      organizationId,
      projectId,
      dto.siteId,
      dto.targetKeyword,
      job.id,
    );

    return { ...job, warnings };
  }

  /** 失败任务重新入队，从失败步骤续跑（不重复已完成阶段） */
  async retry(organizationId: string, projectId: string, id: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        serpData: true,
        briefData: true,
        draftData: true,
        seoCheckData: true,
        semrushScore: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.status !== 'FAILED') {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅失败状态的任务可重试');
    }

    await this.billingService.assertArticleQuota(organizationId, 1);

    const resumeFrom = resolveResumeStep(job);
    const retryTraceId = `tr_${uuidv4()}`;
    const retryScraperOptions = buildArticleJobScraperOptions(getArticleJobConfig(job.seoCheckData));

    const baseCheck = withWorkflowMeta(job.seoCheckData, null);
    const prevSemrush = baseCheck.semrush as Record<string, unknown> | undefined;
    const retrySeoCheckData = {
      ...(prevSemrush
        ? (() => {
            const { cancelled: _cancelled, ...semrushRest } = prevSemrush;
            return { ...baseCheck, semrush: semrushRest };
          })()
        : baseCheck),
      suppressFailureNotification: true,
    };

    await this.prisma.articleJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        traceId: retryTraceId,
        seoCheckData: retrySeoCheckData as object,
      },
    });

    try {
      await this.queueService.enqueueArticleJob(
        {
          jobId: job.id,
          traceId: retryTraceId,
          organizationId,
          projectId,
          resumeFrom,
          scraperOptions: retryScraperOptions,
        },
        `retry_${job.id}_${Date.now()}`,
      );
    } catch (error) {
      await this.compensateEnqueueFailure(job.id, '入队失败，请稍后重试');
      throw error;
    }

    this.logger.info('Article job retry enqueued', {
      traceId: retryTraceId,
      organizationId,
      projectId,
      jobId: job.id,
      resumeFrom,
      action: 'article_job.retry',
    });

    return {
      id: job.id,
      traceId: retryTraceId,
      status: 'QUEUED' as const,
      targetKeyword: job.targetKeyword,
    };
  }

  private async buildKeywordCannibalizationWarnings(
    organizationId: string,
    projectId: string,
    siteId: string,
    keyword: string,
    excludeJobId?: string,
  ) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        siteId,
        status: { not: 'FAILED' },
        ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
      },
      select: {
        id: true,
        targetKeyword: true,
        status: true,
        updatedAt: true,
        seoCheckData: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const candidates = rows
      .filter((row) => {
        if (row.status !== 'COMPLETED') return true;
        if (row.updatedAt < ninetyDaysAgo) return false;
        const postUrl = (
          (row.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish
            ?.postUrl ?? ''
        ).trim();
        return Boolean(postUrl);
      })
      .map((row) => ({
        jobId: row.id,
        keyword: row.targetKeyword,
        status: row.status,
      }));

    const conflicts = findKeywordConflicts(keyword, candidates);
    if (conflicts.length === 0) return [];

    return conflicts.map((conflict) => ({
      code: 'KEYWORD_CANNIBALIZATION' as const,
      message: `与已有任务「${conflict.keyword}」过于相似（${conflict.reason}）`,
      jobId: conflict.jobId,
      keyword: conflict.keyword,
      status: conflict.status,
      reason: conflict.reason,
    }));
  }

  private resolveJobSerpCountry(
    site: { targetMarket: string | null; settings: unknown },
    override?: string,
  ): string {
    return resolveSerpResearchOptions(
      site.settings,
      { serpCountry: override },
      { targetMarket: site.targetMarket },
    ).serpCountry;
  }

  private async resolveSearchIntent(
    organizationId: string,
    projectId: string,
    targetKeyword: string,
    explicit?: string,
  ): Promise<KeywordIntentValue> {
    if (explicit) {
      return normalizeKeywordIntent(explicit);
    }

    const entry = await this.prisma.keywordEntry.findFirst({
      where: { organizationId, projectId, keyword: targetKeyword },
      orderBy: { updatedAt: 'desc' },
      select: { intent: true },
    });

    return normalizeKeywordIntent(entry?.intent);
  }

  private async compensateEnqueueFailure(jobId: string, errorMessage: string): Promise<void> {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage },
    });
  }
}
