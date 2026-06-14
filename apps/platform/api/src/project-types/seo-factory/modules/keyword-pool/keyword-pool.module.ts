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
import { ArticleJobModule } from '../article-job/article-job.module';
import { KeywordPoolController } from './keyword-pool.controller';
import { KeywordPoolService } from './keyword-pool.service';

@Module({
  imports: [ProjectModule, BillingModule, ArticleJobModule, SeoFactoryProvidersModule],
  controllers: [KeywordPoolController],
  providers: [KeywordPoolService],
  exports: [KeywordPoolService],
})
export class KeywordPoolModule {}
