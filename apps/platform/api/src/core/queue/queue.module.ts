/**
 * BullMQ 根模块：注册 Redis 连接，子模块通过 registerQueue 声明具体队列。
 *
 * 边界：
 * - 不负责：具体 Processor（由 project-type 插件注册）
 *
 * 入口：
 * - QueueModule
 */

import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { OrgQueueLimiterService } from './org-queue-limiter.service';

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
  ],
  providers: [OrgQueueLimiterService],
  exports: [BullModule, OrgQueueLimiterService],
})
export class QueueModule {}
