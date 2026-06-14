/**
 * seo-factory BullMQ 队列注册：供 ArticleJobService 与 Processor 共享。
 *
 * 边界：
 * - 不负责：Processor 实现
 *
 * 入口：
 * - SeoFactoryQueueModule
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ARTICLE_JOB_QUEUE } from '../../core/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: ARTICLE_JOB_QUEUE })],
  exports: [BullModule],
})
export class SeoFactoryQueueModule {}
