/**
 * 文章任务 YMYL 人工审核服务。
 *
 * 边界：
 * - 不负责：YMYL 自动检测（ContentReviewService）
 * - 不负责：计费
 *
 * 入口：
 * - ArticleJobReviewService
 */

import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  getYmylReview,
  isPendingHumanReview,
  type YmylReviewResult,
} from '../content-review/ymyl-detect.util';
import type { DraftStaleness } from '../../constants/draft-edit';
import { ExportService } from '../export/export.service';
import type { ReviewArticleJobDto } from './dto/review-article-job.dto';

@Injectable()
export class ArticleJobReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: ExportService,
    private readonly logger: LoggerService,
  ) {}

  async approve(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: ReviewArticleJobDto,
  ) {
    const job = await this.loadReviewableJob(organizationId, projectId, jobId);

    const draftRow = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { draftData: true },
    });
    const exportStale = (draftRow?.draftData as { staleness?: DraftStaleness | null } | null)
      ?.staleness?.affected?.export === true;
    if (exportStale) {
      throw new BusinessException(
        ErrorCodes.DRAFT_EXPORT_STALE,
        '稿件已手动编辑，导出物已失效，请先重算 SEO 或确认内容后再审核',
      );
    }

    const ymylReview = this.buildReviewUpdate(job.seoCheckData, {
      humanReviewStatus: 'approved',
      humanReviewNote: dto.note?.trim() || undefined,
      humanReviewedAt: new Date().toISOString(),
      humanReviewedBy: ctx.userId,
    });

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { seoCheckData: ymylReview as object },
    });

    const outputUrl = await this.exportService.exportForJob({
      jobId,
      traceId: job.traceId,
      organizationId,
      projectId,
    });

    const updated = await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { outputUrl },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        outputUrl: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    this.logger.info('YMYL review approved', {
      traceId: ctx.traceId,
      jobId,
      action: 'content_review.approve',
      userId: ctx.userId,
      outputUrl,
    });

    return updated;
  }

  async reject(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: ReviewArticleJobDto,
  ) {
    const job = await this.loadReviewableJob(organizationId, projectId, jobId);

    const seoCheckData = this.buildReviewUpdate(job.seoCheckData, {
      humanReviewStatus: 'rejected',
      humanReviewNote: dto.note?.trim() || undefined,
      humanReviewedAt: new Date().toISOString(),
      humanReviewedBy: ctx.userId,
    });

    const updated = await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { seoCheckData: seoCheckData as object },
      select: {
        id: true,
        traceId: true,
        status: true,
        targetKeyword: true,
        outputUrl: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });

    this.logger.info('YMYL review rejected', {
      traceId: ctx.traceId,
      jobId,
      action: 'content_review.reject',
      userId: ctx.userId,
    });

    return updated;
  }

  private async loadReviewableJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        status: true,
        seoCheckData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.status !== 'COMPLETED') {
      throw new BusinessException(ErrorCodes.REVIEW_NOT_PENDING, '仅已完成任务可审核');
    }

    if (!isPendingHumanReview(job.seoCheckData)) {
      throw new BusinessException(ErrorCodes.REVIEW_NOT_PENDING, '该任务不在待审核状态');
    }

    return job;
  }

  private buildReviewUpdate(
    seoCheckData: unknown,
    patch: Partial<YmylReviewResult>,
  ): Record<string, unknown> {
    const current = (seoCheckData ?? {}) as Record<string, unknown>;
    const review = getYmylReview(seoCheckData) ?? {
      requires_human_review: true,
      categories: [],
      matchedSignals: [],
      reviewedAt: new Date().toISOString(),
    };

    return {
      ...current,
      ymylReview: {
        ...review,
        ...patch,
      },
    };
  }
}
