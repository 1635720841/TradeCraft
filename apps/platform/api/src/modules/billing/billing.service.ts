/**
 * M11 计费：监听 article.completed，写入 CreditUsage；配额校验。
 */

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import {
  ARTICLE_COMPLETED_EVENT,
  ORG_QUOTA_LOW_EVENT,
  type ArticleCompletedPayload,
  type OrgQuotaLowPayload,
} from '../../core/event-bus/events';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { LoggerService } from '../../core/logger/logger.service';
import { daysRemaining, isSubscriptionActive } from './subscription.util';

const ARTICLE_SERVICE_TYPE = 'ARTICLE';
const ARTICLE_PROVIDER = 'platform';

export interface QuotaSummary {
  planName: string;
  planId: string | null;
  monthlyQuota: number;
  bonusQuota: number;
  periodQuota: number;
  usedThisMonth: number;
  inFlightJobs: number;
  reservedTotal: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  daysRemaining: number;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly eventEmitter: EventEmitter2,
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
        breakdown: { articleCompleted: 1 },
      },
    });

    this.logger.info('Article usage recorded', {
      traceId: payload.traceId,
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      jobId: payload.jobId,
      action: 'billing.article_recorded',
    });

    await this.maybeEmitQuotaLow(payload.organizationId);
  }

  private async maybeEmitQuotaLow(organizationId: string): Promise<void> {
    try {
      const summary = await this.getQuotaSummary(organizationId);
      const { remaining, periodQuota } = summary;
      if (periodQuota <= 0) return;

      const percentRemaining = Math.round((remaining / periodQuota) * 100);
      const isLow = remaining < 10 || percentRemaining < 20;
      if (!isLow) return;

      const quotaPayload: OrgQuotaLowPayload = {
        organizationId,
        remaining,
        monthlyQuota: periodQuota,
        percentRemaining,
      };
      this.eventEmitter.emit(ORG_QUOTA_LOW_EVENT, quotaPayload);
    } catch (err) {
      this.logger.warn('Quota low check failed', {
        organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

  async exportUsageCsv(
    organizationId: string,
    range?: { from?: string; to?: string },
  ): Promise<string> {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (range?.from) createdAt.gte = new Date(range.from);
    if (range?.to) createdAt.lte = new Date(range.to);

    const items = await this.prisma.creditUsage.findMany({
      where: {
        organizationId,
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const header = 'id,projectId,serviceType,provider,tokensOrCount,estimatedCost,createdAt\n';
    const rows = items
      .map(
        (r) =>
          `${r.id},${r.projectId ?? ''},${r.serviceType},${r.provider},${r.tokensOrCount},${r.estimatedCost},${r.createdAt.toISOString()}`,
      )
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }

  async getQuotaSummary(organizationId: string): Promise<QuotaSummary> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        planId: true,
        planName: true,
        monthlyArticleQuota: true,
        articleQuotaBonus: true,
        subscriptionStatus: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '企业不存在');
    }

    const { periodStart, periodEnd } = this.resolvePeriodRange(org);
    const periodQuota = org.monthlyArticleQuota + org.articleQuotaBonus;

    const [usedThisMonth, inFlightJobs] = await Promise.all([
      this.prisma.creditUsage.count({
        where: {
          organizationId,
          serviceType: ARTICLE_SERVICE_TYPE,
          createdAt: { gte: periodStart, lt: periodEnd },
        },
      }),
      this.prisma.articleJob.count({
        where: {
          organizationId,
          status: { notIn: ['COMPLETED', 'FAILED'] },
        },
      }),
    ]);

    const reservedTotal = usedThisMonth + inFlightJobs;
    const remaining = Math.max(0, periodQuota - reservedTotal);

    return {
      planName: org.planName,
      planId: org.planId,
      monthlyQuota: org.monthlyArticleQuota,
      bonusQuota: org.articleQuotaBonus,
      periodQuota,
      usedThisMonth,
      inFlightJobs,
      reservedTotal,
      remaining,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      subscriptionStatus: org.subscriptionStatus,
      subscriptionActive: isSubscriptionActive(org.subscriptionStatus, org.currentPeriodEnd),
      daysRemaining: org.currentPeriodEnd
        ? daysRemaining(org.currentPeriodEnd)
        : daysRemaining(periodEnd),
    };
  }

  async assertArticleQuota(organizationId: string, additionalCount = 1): Promise<void> {
    const safeCount = Math.max(1, additionalCount);
    const summary = await this.getQuotaSummary(organizationId);

    if (summary.reservedTotal + safeCount > summary.periodQuota) {
      throw new BusinessException(
        ErrorCodes.QUOTA_EXCEEDED,
        `本账期文章配额不足（已用 ${summary.reservedTotal}/${summary.periodQuota}，本次需 ${safeCount} 篇）`,
      );
    }
  }

  private resolvePeriodRange(org: {
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  }): { periodStart: Date; periodEnd: Date } {
    if (org.currentPeriodStart && org.currentPeriodEnd) {
      return { periodStart: org.currentPeriodStart, periodEnd: org.currentPeriodEnd };
    }
    return this.getCurrentMonthRange();
  }

  private getCurrentMonthRange(): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { periodStart, periodEnd };
  }
}
