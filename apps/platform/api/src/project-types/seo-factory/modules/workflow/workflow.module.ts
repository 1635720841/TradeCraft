/**
 * 工作流编排模块。
 *
 * 边界：
 * - 不负责：队列消费（ArticleJobProcessor）
 */

import { Module } from '@nestjs/common';
import { ContentReviewModule } from '../content-review/content-review.module';
import { ExportModule } from '../export/export.module';
import { IllustrationModule } from '../illustration/illustration.module';
import { LinkingModule } from '../linking/linking.module';
import { LlmModule } from '../llm/llm.module';
import { ScraperModule } from '../scraper/scraper.module';
import { SeoCheckerModule } from '../seo-checker/seo-checker.module';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [
    ScraperModule,
    LlmModule,
    SeoCheckerModule,
    ContentReviewModule,
    LinkingModule,
    IllustrationModule,
    ExportModule,
  ],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
