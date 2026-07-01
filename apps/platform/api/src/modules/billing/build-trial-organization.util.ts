/**
 * 新建 CUSTOMER 企业时的试用套餐默认值（供 auth / console 开户共用）。
 */

import { BillingCycle, OrganizationType, SubscriptionStatus } from '@prisma/client';
import { resolveNextPeriodEnd } from './subscription.util';

const TRIAL_MONTHLY_QUOTA = 100;

export function buildTrialOrganizationCreateData(
  name: string,
  type: OrganizationType = OrganizationType.CUSTOMER,
) {
  const now = new Date();
  return {
    name,
    type,
    planId: 'trial',
    planName: 'trial',
    monthlyArticleQuota: TRIAL_MONTHLY_QUOTA,
    billingCycle: BillingCycle.MONTHLY,
    subscriptionStatus: SubscriptionStatus.TRIAL,
    currentPeriodStart: now,
    currentPeriodEnd: resolveNextPeriodEnd(now, BillingCycle.MONTHLY),
  };
}

export function getTrialPlanDefaultsSnapshot() {
  const now = new Date();
  return {
    planId: 'trial' as const,
    planName: 'trial',
    monthlyArticleQuota: TRIAL_MONTHLY_QUOTA,
    billingCycle: BillingCycle.MONTHLY,
    subscriptionStatus: SubscriptionStatus.TRIAL,
    currentPeriodStart: now,
    currentPeriodEnd: resolveNextPeriodEnd(now, BillingCycle.MONTHLY),
  };
}
