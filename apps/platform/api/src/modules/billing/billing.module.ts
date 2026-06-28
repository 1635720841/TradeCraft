/**
 * 计费模块。
 */

import { Module } from '@nestjs/common';
import { OrgBillingController, LegacyBillingController } from './org-billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
  controllers: [OrgBillingController, LegacyBillingController],
  providers: [BillingService, SubscriptionPlanService],
  exports: [BillingService, SubscriptionPlanService],
})
export class BillingModule {}
