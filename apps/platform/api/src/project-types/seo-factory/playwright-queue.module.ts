/**
 * seo-factory Playwright 专用 BullMQ 队列：Semrush RPA 低频限速。
 *
 * 边界：
 * - 不负责：文章工作流入队（SeoFactoryQueueModule）
 *
 * 入口：
 * - PlaywrightQueueModule
 */

import { Module } from '@nestjs/common';
import { SeoFactoryQueueModule } from './seo-factory-queue.module';
import { PlaywrightJobProcessor } from './processors/playwright-job.processor';
import { SeoFactoryProvidersModule } from './providers/seo-factory-providers.module';
import { SemrushQueueService } from './services/semrush-queue.service';

@Module({
  imports: [SeoFactoryQueueModule, SeoFactoryProvidersModule],
  providers: [SemrushQueueService, PlaywrightJobProcessor],
  exports: [SemrushQueueService, SeoFactoryQueueModule],
})
export class PlaywrightQueueModule {}
