/**
 * 文章任务活动流模块（供 article-job / export 共用）。
 */

import { Module } from '@nestjs/common';
import { ArticleJobActivityService } from './article-job-activity.service';

@Module({
  providers: [ArticleJobActivityService],
  exports: [ArticleJobActivityService],
})
export class ArticleJobActivityModule {}
