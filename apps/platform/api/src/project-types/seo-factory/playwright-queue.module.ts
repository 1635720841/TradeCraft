/**
 * seo-factory Playwright 专用 BullMQ 队列：Semrush RPA 低频限速。
 *
 * 边界：
 * - 不负责：文章工作流入队（SeoFactoryQueueModule）
 *
 * 入口：
 * - PlaywrightQueueModule
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PLAYWRIGHT_QUEUE } from '../../core/queue/queue.constants';
import { PlaywrightJobProcessor } from './processors/playwright-job.processor';
import { SeoFactoryProvidersModule } from './providers/seo-factory-providers.module';
import { SemrushQueueService } from './services/semrush-queue.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: PLAYWRIGHT_QUEUE }),
    SeoFactoryProvidersModule,
  ],
  providers: [SemrushQueueService, PlaywrightJobProcessor],
  exports: [SemrushQueueService, BullModule],
})
export class PlaywrightQueueModule {}
