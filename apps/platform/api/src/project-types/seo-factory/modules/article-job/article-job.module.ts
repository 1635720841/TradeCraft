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
import { ArticleJobBriefService } from './article-job-brief.service';
import { ArticleJobController } from './article-job.controller';
import { ArticleJobCollabController } from './article-job-collab.controller';
import { ArticleJobCollabService } from './article-job-collab.service';
import { ArticleJobService } from './article-job.service';
import { LinkingModule } from '../linking/linking.module';
import { ExportModule } from '../export/export.module';
import { GscModule } from '../gsc/gsc.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ArticleJobInternalLinksService } from './article-job-internal-links.service';

@Module({
  imports: [ProjectModule, BillingModule, SeoFactoryQueueModule, SeoCheckerModule, LlmModule, SiteModule, ExportModule, LinkingModule, GscModule, ScraperModule],
  controllers: [ArticleJobController, ArticleJobCollabController],
  providers: [ArticleJobService, ArticleJobCollabService, ArticleJobBriefService, ArticleJobInternalLinksService, ArticleJobRewriteService, ArticleJobDraftEditService, ArticleJobDraftImageService, ArticleJobReviewService],
  exports: [ArticleJobService],
})
export class ArticleJobModule {}
