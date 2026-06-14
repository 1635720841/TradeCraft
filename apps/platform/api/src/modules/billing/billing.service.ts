/**
 * M11 计费：监听 article.completed，写入 CreditUsage。
 *
 * 边界：
 * - 不负责：扣费策略/套餐（当前按篇计费占位）
 */

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import {
  ARTICLE_COMPLETED_EVENT,
  type ArticleCompletedPayload,
} from '../../core/event-bus/events';
import { LoggerService } from '../../core/logger/logger.service';

const ARTICLE_SERVICE_TYPE = 'ARTICLE';
const ARTICLE_PROVIDER = 'platform';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(ARTICLE_COMPLETED_EVENT)
  async onArticleCompleted(payload: ArticleCompletedPayload): Promise<void> {
    const existing = await this.prisma.creditUsage.findFirst({
      where: {
        traceId: payload.traceId,
        serviceType: ARTICLE_SERVICE_TYPE,
      },
      select: { id: true },
    });

    if (existing) {
      this.logger.info('Billing skipped (idempotent)', {
        traceId: payload.traceId,
        jobId: payload.jobId,
        action: 'billing.skip_duplicate',
      });
      return;
    }

    await this.prisma.creditUsage.create({
      data: {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        projectType: 'seo-factory',
        serviceType: ARTICLE_SERVICE_TYPE,
        provider: ARTICLE_PROVIDER,
        tokensOrCount: 1,
        estimatedCost: 0,
        traceId: payload.traceId,
      },
    });

    this.logger.info('Article usage recorded', {
      traceId: payload.traceId,
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      jobId: payload.jobId,
      action: 'billing.article_recorded',
    });
  }

  async listUsage(organizationId: string, page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.creditUsage.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.creditUsage.count({ where: { organizationId } }),
    ]);

    return { items, page: safePage, limit: safeLimit, total };
  }
}
