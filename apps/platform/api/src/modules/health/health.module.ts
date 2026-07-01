/**
 * 健康检查模块。
 *
 * 边界：
 * - 不负责：业务逻辑
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  ARTICLE_JOB_QUEUE,
  GSC_SYNC_QUEUE,
  PLAYWRIGHT_QUEUE,
} from '../../core/queue/queue.constants';
import { HealthController } from './health.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: ARTICLE_JOB_QUEUE }),
    BullModule.registerQueue({ name: PLAYWRIGHT_QUEUE }),
    BullModule.registerQueue({ name: GSC_SYNC_QUEUE }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
