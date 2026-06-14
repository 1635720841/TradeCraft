/**
 * 内容审查服务：M7 YMYL 敏感内容标记。
 *
 * 边界：
 * - 不负责：Semrush 优化、内链植入
 *
 * 入口：
 * - ContentReviewService
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { detectYmylContent } from './ymyl-detect.util';

export interface ContentReviewJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  targetKeyword: string;
}

@Injectable()
export class ContentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async runYmylReview(ctx: ContentReviewJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { briefData: true, draftData: true, seoCheckData: true },
    });

    if (!job) {
      this.logger.warn('YMYL review skipped: job not found', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'content_review.skip_not_found',
      });
      return;
    }

    const briefData = job.briefData as {
      title?: string;
      outline?: { sections?: Array<{ heading?: string; summary?: string }> };
    } | null;
    const draftData = job.draftData as { content?: string } | null;

    const briefText = [
      briefData?.title,
      ...(briefData?.outline?.sections ?? []).flatMap((section) => [
        section.heading,
        section.summary,
      ]),
    ]
      .filter(Boolean)
      .join('\n');

    const review = detectYmylContent({
      targetKeyword: ctx.targetKeyword,
      briefText,
      content: draftData?.content,
    });

    const seoCheckData = {
      ...((job.seoCheckData ?? {}) as Record<string, unknown>),
      ymylReview: review,
    };

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: { seoCheckData: seoCheckData as object },
    });

    this.logger.info('YMYL review completed', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'content_review.ymyl',
      requiresHumanReview: review.requires_human_review,
      categories: review.categories,
      signalCount: review.matchedSignals.length,
    });
  }
}
