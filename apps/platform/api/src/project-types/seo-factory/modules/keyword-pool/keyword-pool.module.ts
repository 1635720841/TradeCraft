/**
 * 关键词池模块。
 *
 * 边界：
 * - 不负责：Semrush RPA 写作助手
 */

import { Module } from '@nestjs/common';
import { BillingModule } from '../../../../modules/billing/billing.module';
import { ProjectModule } from '../../../../modules/project/project.module';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { GscModule } from '../gsc/gsc.module';
import { ArticleJobModule } from '../article-job/article-job.module';
import { KeywordClusterController } from './keyword-cluster.controller';
import { KeywordClusterService } from './keyword-cluster.service';
import { KeywordPoolController } from './keyword-pool.controller';
import { KeywordPoolService } from './keyword-pool.service';

@Module({
  imports: [ProjectModule, BillingModule, ArticleJobModule, GscModule, SeoFactoryProvidersModule],
  controllers: [KeywordPoolController, KeywordClusterController],
  providers: [KeywordPoolService, KeywordClusterService],
  exports: [KeywordPoolService, KeywordClusterService],
})
export class KeywordPoolModule {}
