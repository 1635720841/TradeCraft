/**
 * demo-factory Port 桥接（空实现）。
 */

import { Module } from '@nestjs/common';
import { DemoFactoryBillingMeterService } from './demo-factory-billing-meter.service';
import { DemoFactoryProductionStatsService } from './demo-factory-production-stats.service';
import { DemoFactoryProjectSearchService } from './demo-factory-project-search.service';

@Module({
  providers: [
    DemoFactoryProductionStatsService,
    DemoFactoryBillingMeterService,
    DemoFactoryProjectSearchService,
  ],
})
export class DemoFactoryProductionBridgeModule {}
