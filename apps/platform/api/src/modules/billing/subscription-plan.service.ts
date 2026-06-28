/**
 * 套餐与订阅账期管理。
 */

import { Injectable } from '@nestjs/common';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import {
  assertValidPeriodRange,
  daysRemaining,
  isSubscriptionActive,
  resolveNextPeriodEnd,
} from './subscription.util';

const PLAN_DEFAULTS: Record<
  string,
  { name: string; monthlyArticleQuota: number; billingCycle: BillingCycle }
> = {
  trial: { name: '试用版', monthlyArticleQuota: 100, billingCycle: BillingCycle.MONTHLY },
  standard: { name: '标准版', monthlyArticleQuota: 500, billingCycle: BillingCycle.MONTHLY },
  enterprise: { name: '企业版', monthlyArticleQuota: 2000, billingCycle: BillingCycle.YEARLY },
};

@Injectable()
export class SubscriptionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async syncPlansToDb(): Promise<void> {
    let sortOrder = 0;
    for (const [id, plan] of Object.entries(PLAN_DEFAULTS)) {
      await this.prisma.subscriptionPlan.upsert({
        where: { id },
        create: {
          id,
          name: plan.name,
          monthlyArticleQuota: plan.monthlyArticleQuota,
          billingCycle: plan.billingCycle,
          sortOrder: sortOrder++,
        },
        update: {
          name: plan.name,
          monthlyArticleQuota: plan.monthlyArticleQuota,
          billingCycle: plan.billingCycle,
          sortOrder: sortOrder++,
        },
      });
    }
  }

  async listActivePlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getTrialPlanDefaults() {
    const trial = PLAN_DEFAULTS.trial;
    const now = new Date();
    const periodEnd = resolveNextPeriodEnd(now, trial.billingCycle);
    return {
      planId: 'trial',
      planName: 'trial',
      monthlyArticleQuota: trial.monthlyArticleQuota,
      billingCycle: trial.billingCycle,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    };
  }

  async applyPlan(
    organizationId: string,
    planName: string,
    options?: {
      billingCycle?: BillingCycle;
      customQuota?: number;
      resetPeriod?: boolean;
      subscriptionStatus?: SubscriptionStatus;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
    },
  ) {
    const planKey = planName.trim().toLowerCase();
    const defaults = PLAN_DEFAULTS[planKey];
    if (!defaults) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, `未知套餐：${planName}`);
    }

    const billingCycle = options?.billingCycle ?? defaults.billingCycle;
    const periodStart = options?.currentPeriodStart ?? new Date();
    const periodEnd =
      options?.currentPeriodEnd ??
      (options?.resetPeriod !== false
        ? resolveNextPeriodEnd(periodStart, billingCycle)
        : undefined);

    if (periodEnd) {
      assertValidPeriodRange(periodStart, periodEnd);
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        planId: planKey,
        planName: planKey,
        monthlyArticleQuota: options?.customQuota ?? defaults.monthlyArticleQuota,
        billingCycle,
        subscriptionStatus: options?.subscriptionStatus ?? SubscriptionStatus.ACTIVE,
        ...(periodEnd
          ? { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }
          : {}),
      },
    });
  }

  async renewCurrentPeriod(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { billingCycle: true, currentPeriodEnd: true },
    });
    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '企业不存在');
    }

    const start = org.currentPeriodEnd ?? new Date();
    const end = resolveNextPeriodEnd(start, org.billingCycle);

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
      select: {
        subscriptionStatus: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });
  }

  async addQuotaTopUp(organizationId: string, amount: number, note?: string) {
    if (amount < 1) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '加购数量至少为 1');
    }

    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { articleQuotaBonus: { increment: amount } },
      select: { articleQuotaBonus: true },
    });

    return { amount, bonusTotal: org.articleQuotaBonus, note };
  }

  buildQuotaExtras(org: {
    subscriptionStatus: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    articleQuotaBonus: number;
  }) {
    const periodStart = org.currentPeriodStart?.toISOString() ?? null;
    const periodEnd = org.currentPeriodEnd?.toISOString() ?? null;
    return {
      subscriptionStatus: org.subscriptionStatus,
      subscriptionActive: isSubscriptionActive(org.subscriptionStatus, org.currentPeriodEnd),
      periodStart,
      periodEnd,
      daysRemaining: org.currentPeriodEnd ? daysRemaining(org.currentPeriodEnd) : null,
      bonusQuota: org.articleQuotaBonus,
    };
  }
}
