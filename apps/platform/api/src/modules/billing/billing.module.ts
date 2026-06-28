/**
 * 计费模块。
 */

import { Module } from '@nestjs/common';
import { OrgBillingController } from './org-billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
  controllers: [OrgBillingController],
  providers: [BillingService, SubscriptionPlanService],
  exports: [BillingService, SubscriptionPlanService],
})
export class BillingModule {}
