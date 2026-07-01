/**
 * 自动生产模块。
 *
 * 边界：
 * - 不负责：站点配置写入（SiteService）
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AUTOPILOT_QUEUE } from '../../../../core/queue/queue.constants';
import { ExportModule } from '../export/export.module';
import { GscModule } from '../gsc/gsc.module';
import { KeywordPoolModule } from '../keyword-pool/keyword-pool.module';
import { AutopilotScheduler } from './autopilot.scheduler';
import { AutopilotService } from './autopilot.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: AUTOPILOT_QUEUE }),
    KeywordPoolModule,
    GscModule,
    ExportModule,
  ],
  providers: [AutopilotService, AutopilotScheduler],
  exports: [AutopilotService],
})
export class AutopilotModule {}
