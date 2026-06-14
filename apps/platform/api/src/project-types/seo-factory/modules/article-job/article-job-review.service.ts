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
import { ExportService } from '../export/export.service';
import type { ReviewArticleJobDto } from './dto/review-article-job.dto';

@Injectable()
export class ArticleJobReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: ExportService,
    private readonly logger: LoggerService,
  ) {}

  async listPending(organizationId: string, projectId: string, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        status: 'COMPLETED',
        seoCheckData: {
          path: ['ymylReview', 'requires_human_review'],
          equals: true,
        },
      },
      select: {
        id: true,
        traceId: true,
        targetKeyword: true,
        status: true,
        seoCheckData: true,
        draftData: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const pending = rows.filter((row) => isPendingHumanReview(row.seoCheckData));
    const total = pending.length;
    const skip = (safePage - 1) * safeLimit;
    const items = pending.slice(skip, skip + safeLimit).map((row) => this.toReviewItem(row));

    return { items, total, page: safePage, limit: safeLimit };
  }

  async approve(
    ctx: RequestContext,
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: ReviewArticleJobDto,
  ) {
    const job = await this.loadReviewableJob(organizationId, projectId, jobId);

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

  private toReviewItem(row: {
    id: string;
    traceId: string;
    targetKeyword: string;
    status: string;
    seoCheckData: unknown;
    draftData: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const review = getYmylReview(row.seoCheckData);
    const draftData = row.draftData as { title?: string } | null;

    return {
      id: row.id,
      traceId: row.traceId,
      targetKeyword: row.targetKeyword,
      title: draftData?.title ?? row.targetKeyword,
      status: row.status,
      ymylReview: review,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
