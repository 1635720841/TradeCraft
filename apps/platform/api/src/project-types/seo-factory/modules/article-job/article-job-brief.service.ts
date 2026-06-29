/**
 * Brief 确认与编辑：人工卡点后再进入初稿。
 *
 * 边界：
 * - 不负责：Brief LLM 生成（LlmService）
 *
 * 入口：
 * - ArticleJobBriefService
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import type { RequestContext } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { AuditService } from '../../../../modules/access/audit.service';
import { ArticleJobActivityService } from './article-job-activity.service';
import { ARTICLE_JOB_QUEUE } from '../../../../core/queue/queue.constants';
import {
  isBriefApprovalPending,
  withBriefApproval,
} from '../../constants/brief-approval';
import { MAX_BATCH_ACTION_LIMIT } from '../../constants/batch-actions';
import type { ArticleJobQueuePayload } from '../../processors/article-job.processor';
import type { PatchArticleBriefDto } from './dto/patch-article-brief.dto';

@Injectable()
export class ArticleJobBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly auditService: AuditService,
    private readonly activityService: ArticleJobActivityService,
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleJobQueue: Queue<ArticleJobQueuePayload>,
  ) {}

  async patchBrief(
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: PatchArticleBriefDto,
  ) {
    const job = await this.loadJob(organizationId, projectId, jobId);

    if (!isBriefApprovalPending(job.briefData)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅「待确认 Brief」状态可编辑大纲');
    }

    const briefData = (job.briefData ?? {}) as Record<string, unknown>;
    const outline = (briefData.outline ?? {}) as Record<string, unknown>;

    const nextOutline = {
      ...outline,
      ...(dto.title != null ? { title: dto.title.trim() } : {}),
      ...(dto.searchIntent != null ? { searchIntent: dto.searchIntent.trim() } : {}),
      ...(dto.targetWordCount != null ? { targetWordCount: dto.targetWordCount } : {}),
      ...(dto.outline != null
        ? {
            outline: dto.outline.map((section) => ({
              heading: section.heading.trim(),
              points: section.points?.map((point) => point.trim()).filter(Boolean) ?? [],
            })),
          }
        : {}),
      ...(dto.contentGaps != null
        ? { contentGaps: dto.contentGaps.map((gap) => gap.trim()).filter(Boolean) }
        : {}),
      ...(dto.faqCandidates != null
        ? { faqCandidates: dto.faqCandidates.map((item) => item.trim()).filter(Boolean) }
        : {}),
      ...(dto.featuredSnippetTarget != null
        ? {
            featuredSnippetTarget: {
              heading: dto.featuredSnippetTarget.heading.trim(),
              answerMaxWords: dto.featuredSnippetTarget.answerMaxWords ?? 55,
            },
          }
        : {}),
    };

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        briefData: {
          ...briefData,
          outline: nextOutline,
        } as object,
      },
    });

    return this.findOneBrief(organizationId, projectId, jobId);
  }

  async approveBrief(ctx: RequestContext, organizationId: string, projectId: string, jobId: string) {
    const job = await this.loadJob(organizationId, projectId, jobId);

    if (!isBriefApprovalPending(job.briefData)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '当前任务无需 Brief 确认');
    }

    const briefData = withBriefApproval(job.briefData, {
      approvalStatus: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: ctx.userId,
    });

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        briefData: briefData as object,
        status: 'QUEUED',
        errorMessage: null,
      },
    });

    const traceId = `tr_${uuidv4()}`;
    await this.articleJobQueue.add(
      'generate',
      {
        jobId,
        traceId,
        organizationId,
        projectId,
        resumeFrom: 'draft',
      },
      { jobId: `brief_approve_${jobId}_${Date.now()}` },
    );

    this.logger.info('Brief approved, draft enqueued', {
      traceId,
      organizationId,
      projectId,
      jobId,
      action: 'article_job.brief_approve',
    });

    await this.auditService.log({
      organizationId,
      actorUserId: ctx.userId,
      action: 'article_job.brief_approve',
      targetType: 'ArticleJob',
      targetId: jobId,
      traceId,
    });
    await this.activityService.record({
      organizationId,
      projectId,
      jobId,
      type: 'brief_approved',
      actorUserId: ctx.userId,
      summary: 'Brief 已确认',
    });

    return this.findOneBrief(organizationId, projectId, jobId);
  }

  async batchApproveBrief(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobIds: string[],
  ) {
    if (jobIds.length > MAX_BATCH_ACTION_LIMIT) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `单次最多确认 ${MAX_BATCH_ACTION_LIMIT} 个 Brief`,
      );
    }

    const results: Array<{
      jobId: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const jobId of jobIds) {
      try {
        await this.approveBrief(ctx, organizationId, projectId, jobId);
        results.push({ jobId, ok: true });
      } catch (error) {
        const message =
          error instanceof BusinessException
            ? error.message
            : error instanceof Error
              ? error.message
              : '确认失败';
        results.push({ jobId, ok: false, error: message });
      }
    }

    return {
      approved: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }

  async regenerateBrief(organizationId: string, projectId: string, jobId: string) {
    const job = await this.loadJob(organizationId, projectId, jobId);

    if (!isBriefApprovalPending(job.briefData)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '当前任务无需 Brief 确认');
    }

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        briefData: Prisma.DbNull,
        status: 'QUEUED',
        errorMessage: null,
      },
    });

    const traceId = `tr_${uuidv4()}`;
    await this.articleJobQueue.add(
      'generate',
      {
        jobId,
        traceId,
        organizationId,
        projectId,
        resumeFrom: 'brief',
      },
      { jobId: `brief_regen_${jobId}_${Date.now()}` },
    );

    this.logger.info('Brief regeneration enqueued', {
      traceId,
      organizationId,
      projectId,
      jobId,
      action: 'article_job.brief_regenerate',
    });

    return { id: jobId, traceId, status: 'QUEUED' as const };
  }

  private async loadJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { id: true, briefData: true, status: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    return job;
  }

  private async findOneBrief(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        briefData: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    return job;
  }
}
