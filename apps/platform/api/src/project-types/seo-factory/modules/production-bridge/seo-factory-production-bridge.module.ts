/**
 * seo-factory 生产统计 / 计费 Port 桥接模块。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { SeoFactoryBillingMeterService } from './seo-factory-billing-meter.service';
import { SeoFactoryProductionStatsService } from './seo-factory-production-stats.service';
import { SeoFactoryConsoleSiteEnrichmentService } from '../console-bridge/seo-factory-console-site-enrichment.service';
import { SeoFactoryProjectSearchService } from '../console-bridge/seo-factory-project-search.service';

@Module({
  imports: [ProjectModule],
  providers: [
    SeoFactoryProductionStatsService,
    SeoFactoryBillingMeterService,
    SeoFactoryConsoleSiteEnrichmentService,
    SeoFactoryProjectSearchService,
  ],
  exports: [SeoFactoryProductionStatsService, SeoFactoryBillingMeterService],
})
export class SeoFactoryProductionBridgeModule {}
