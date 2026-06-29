/**
 * M10 导出模块。
 */

import { Module } from '@nestjs/common';
import { AccessModule } from '../../../../modules/access/access.module';
import { ProjectModule } from '../../../../modules/project/project.module';
import { ArticleJobActivityModule } from '../article-job/article-job-activity.module';
import { CmsPublishService } from './cms-publish.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ShopifyFilesService } from './shopify-files.service';

@Module({
  imports: [ProjectModule, AccessModule, ArticleJobActivityModule],
  controllers: [ExportController],
  providers: [ExportService, CmsPublishService, ShopifyFilesService],
  exports: [ExportService, CmsPublishService],
})
export class ExportModule {}
