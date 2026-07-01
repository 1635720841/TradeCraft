/**
 * Google Search Console 模块。
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GSC_SYNC_QUEUE } from '../../../../core/queue/queue.constants';
import { BillingModule } from '../../../../modules/billing/billing.module';
import { ProjectModule } from '../../../../modules/project/project.module';
import { GscController, GscOAuthController, GscProjectController } from './gsc.controller';
import { GscSyncScheduler } from './gsc-sync.scheduler';
import { GscAnalyticsService } from './gsc-analytics.service';
import { GscConsoleService } from './gsc-console.service';
import { GscOAuthService } from './gsc-oauth.service';
import { GscSyncService } from './gsc-sync.service';
import { GscService } from './gsc.service';

@Module({
  imports: [ProjectModule, BillingModule, BullModule.registerQueue({ name: GSC_SYNC_QUEUE })],
  controllers: [GscController, GscProjectController, GscOAuthController],
  providers: [
    GscOAuthService,
    GscSyncService,
    GscConsoleService,
    GscAnalyticsService,
    GscService,
    GscSyncScheduler,
  ],
  exports: [GscService],
})
export class GscModule {}
