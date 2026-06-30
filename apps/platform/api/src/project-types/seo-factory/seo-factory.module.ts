/**
 * SEO 工厂插件根模块：组装 seo-factory 下所有子模块。
 *
 * 边界：
 * - 不负责：平台层 auth/billing
 *
 * 入口：
 * - SeoFactoryModule
 */

import { Module } from '@nestjs/common';
import { ArticleJobModule } from './modules/article-job/article-job.module';
import { ArticleScoreModule } from './modules/article-score/article-score.module';
import { ExportModule } from './modules/export/export.module';
import { GscModule } from './modules/gsc/gsc.module';
import { ScoreCalibrationModule } from './modules/score-calibration/score-calibration.module';
import { KeywordPoolModule } from './modules/keyword-pool/keyword-pool.module';
import { LinkingModule } from './modules/linking/linking.module';
import { SiteModule } from './modules/site/site.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { ArticleJobProcessor } from './processors/article-job.processor';
import { GscSyncProcessor } from './processors/gsc-sync.processor';
import { PlaywrightQueueModule } from './playwright-queue.module';
import { SeoFactoryProvidersModule } from './providers/seo-factory-providers.module';
import { SeoFactoryQueueModule } from './seo-factory-queue.module';
import { SeoFactoryQueueJobEnrichmentService } from './modules/console-bridge/seo-factory-queue-job-enrichment.service';

@Module({
  imports: [
    SeoFactoryQueueModule,
    PlaywrightQueueModule,
    SeoFactoryProvidersModule,
    WorkflowModule,
    SiteModule,
    LinkingModule,
    ArticleJobModule,
    ArticleScoreModule,
    ExportModule,
    KeywordPoolModule,
    GscModule,
    ScoreCalibrationModule,
  ],
  providers: [ArticleJobProcessor, GscSyncProcessor, SeoFactoryQueueJobEnrichmentService],
})
export class SeoFactoryModule {}
