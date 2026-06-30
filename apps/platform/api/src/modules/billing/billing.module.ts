/**
 * 计费模块。
 */

import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { OrgBillingController } from './org-billing.controller';
import { BillingRequestService } from './billing-request.service';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
  imports: [AccessModule],
  controllers: [OrgBillingController],
  providers: [
    BillingService,
    SubscriptionPlanService,
    EntitlementsService,
    BillingRequestService,
  ],
  exports: [BillingService, SubscriptionPlanService, EntitlementsService, BillingRequestService],
})
export class BillingModule {}
