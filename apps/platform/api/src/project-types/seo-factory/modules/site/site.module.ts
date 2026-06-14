/**
 * 站点模块。
 *
 * 边界：
 * - 不负责：任务编排
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { SiteArticleCrawlerService } from './site-article-crawler.service';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

@Module({
  imports: [ProjectModule],
  controllers: [SiteController],
  providers: [SiteService, SiteArticleCrawlerService],
  exports: [SiteService, SiteArticleCrawlerService],
})
export class SiteModule {}
