/**
 * 站点模块。
 *
 * 边界：
 * - 不负责：任务编排
 */

import { Module } from '@nestjs/common';
import { AccessModule } from '../../../../modules/access/access.module';
import { BillingModule } from '../../../../modules/billing/billing.module';
import { ProjectModule } from '../../../../modules/project/project.module';
import { GscModule } from '../gsc/gsc.module';
import { SiteArticleCrawlerService } from './site-article-crawler.service';
import { SiteCmsService } from './site-cms.service';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';
import { SitePageService } from '../linking/site-page.service';

@Module({
  imports: [AccessModule, ProjectModule, BillingModule, GscModule],
  controllers: [SiteController],
  providers: [SiteService, SiteCmsService, SiteArticleCrawlerService, SitePageService],
  exports: [SiteService, SiteArticleCrawlerService, SitePageService],
})
export class SiteModule {}
