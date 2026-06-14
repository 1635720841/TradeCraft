/**
 * 文章任务模块。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowModule）、外部 API（Provider）
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { SeoFactoryQueueModule } from '../../seo-factory-queue.module';
import { LlmModule } from '../llm/llm.module';
import { SeoCheckerModule } from '../seo-checker/seo-checker.module';
import { SiteModule } from '../site/site.module';
import { ArticleJobRewriteService } from './article-job-rewrite.service';
import { ArticleJobController } from './article-job.controller';
import { ArticleJobService } from './article-job.service';

@Module({
  imports: [ProjectModule, SeoFactoryQueueModule, SeoCheckerModule, LlmModule, SiteModule],
  controllers: [ArticleJobController],
  providers: [ArticleJobService, ArticleJobRewriteService],
  exports: [ArticleJobService],
})
export class ArticleJobModule {}
