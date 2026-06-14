/**
 * 文章任务模块。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowModule）、外部 API（Provider）
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { BillingModule } from '../../../../modules/billing/billing.module';
import { SeoFactoryQueueModule } from '../../seo-factory-queue.module';
import { LlmModule } from '../llm/llm.module';
import { SeoCheckerModule } from '../seo-checker/seo-checker.module';
import { SiteModule } from '../site/site.module';
import { ArticleJobDraftEditService } from './article-job-draft-edit.service';
import { ArticleJobDraftImageService } from './article-job-draft-image.service';
import { ArticleJobRewriteService } from './article-job-rewrite.service';
import { ArticleJobReviewService } from './article-job-review.service';
import { ArticleJobController } from './article-job.controller';
import { ArticleJobService } from './article-job.service';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [ProjectModule, BillingModule, SeoFactoryQueueModule, SeoCheckerModule, LlmModule, SiteModule, ExportModule],
  controllers: [ArticleJobController],
  providers: [ArticleJobService, ArticleJobRewriteService, ArticleJobDraftEditService, ArticleJobDraftImageService, ArticleJobReviewService],
  exports: [ArticleJobService],
})
export class ArticleJobModule {}
