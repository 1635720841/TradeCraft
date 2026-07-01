/**
 * 文章任务模块。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowModule）、外部 API（Provider）
 */

import { Module } from '@nestjs/common';
import { AccessModule } from '../../../../modules/access/access.module';
import { ProjectModule } from '../../../../modules/project/project.module';
import { BillingModule } from '../../../../modules/billing/billing.module';
import { SeoFactoryQueueModule } from '../../seo-factory-queue.module';
import { LlmModule } from '../llm/llm.module';
import { SeoCheckerModule } from '../seo-checker/seo-checker.module';
import { SiteModule } from '../site/site.module';
import { ArticleJobDraftEditService } from './article-job-draft-edit.service';
import { ArticleJobRewriteService } from './article-job-rewrite.service';
import { ArticleJobReviewService } from './article-job-review.service';
import { ArticleJobStatsService } from './article-job-stats.service';
import { ArticleJobBriefService } from './article-job-brief.service';
import { ArticleJobController } from './article-job.controller';
import { ArticleJobBatchController } from './article-job-batch.controller';
import { ArticleJobLifecycleController } from './article-job-lifecycle.controller';
import { ArticleJobWorkflowController } from './article-job-workflow.controller';
import { ArticleJobEditorController } from './article-job-editor.controller';
import { ArticleJobCollabController } from './article-job-collab.controller';
import { ArticleJobCollabService } from './article-job-collab.service';
import { ArticleJobCreateService } from './article-job-create.service';
import { ArticleJobLifecycleService } from './article-job-lifecycle.service';
import { ArticleJobService } from './article-job.service';
import { ArticleJobListService } from './article-job-list.service';
import { ArticleJobBatchService } from './article-job-batch.service';
import { ArticleJobQueueService } from './article-job-queue.service';
import { LinkingModule } from '../linking/linking.module';
import { ExportModule } from '../export/export.module';
import { GscModule } from '../gsc/gsc.module';
import { ScraperModule } from '../scraper/scraper.module';
import { IllustrationModule } from '../illustration/illustration.module';
import { MediaModule } from '../../../../modules/media/media.module';
import { ArticleJobInternalLinksService } from './article-job-internal-links.service';
import { ArticleJobImagesService } from './article-job-images.service';
import { ArticleJobActivityModule } from './article-job-activity.module';

@Module({
  imports: [ProjectModule, AccessModule, MediaModule, ArticleJobActivityModule, BillingModule, SeoFactoryQueueModule, SeoCheckerModule, LlmModule, SiteModule, ExportModule, LinkingModule, IllustrationModule, GscModule, ScraperModule],
  controllers: [
    ArticleJobController,
    ArticleJobBatchController,
    ArticleJobLifecycleController,
    ArticleJobWorkflowController,
    ArticleJobEditorController,
    ArticleJobCollabController,
  ],
  providers: [
    ArticleJobService,
    ArticleJobCreateService,
    ArticleJobLifecycleService,
    ArticleJobListService,
    ArticleJobBatchService,
    ArticleJobQueueService,
    ArticleJobStatsService,
    ArticleJobCollabService,
    ArticleJobBriefService,
    ArticleJobInternalLinksService,
    ArticleJobImagesService,
    ArticleJobRewriteService,
    ArticleJobDraftEditService,
    ArticleJobReviewService,
  ],
  exports: [ArticleJobService, ArticleJobStatsService],
})
export class ArticleJobModule {}
