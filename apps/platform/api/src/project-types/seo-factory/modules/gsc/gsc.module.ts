/**
 * Google Search Console 模块。
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GSC_SYNC_QUEUE } from '../../../../core/queue/queue.constants';
import { ProjectModule } from '../../../../modules/project/project.module';
import { GscController, GscOAuthController, GscProjectController } from './gsc.controller';
import { GscSyncScheduler } from './gsc-sync.scheduler';
import { GscService } from './gsc.service';

@Module({
  imports: [ProjectModule, BullModule.registerQueue({ name: GSC_SYNC_QUEUE })],
  controllers: [GscController, GscProjectController, GscOAuthController],
  providers: [GscService, GscSyncScheduler],
  exports: [GscService],
})
export class GscModule {}
