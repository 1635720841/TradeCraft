/**
 * demo-factory 插件根模块。
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DEMO_FACTORY_QUEUE } from '../../core/queue/queue.constants';
import { DemoItemModule } from './modules/demo-item/demo-item.module';
import { DemoTickProcessor } from './processors/demo-tick.processor';
import { DemoTickBootstrapService } from './processors/demo-tick-bootstrap.service';
import { DemoFactoryProductionBridgeModule } from './modules/production-bridge/demo-factory-production-bridge.module';
import { DemoProjectCreatedListener } from './listeners/demo-project-created.listener';

@Module({
  imports: [
    BullModule.registerQueue({ name: DEMO_FACTORY_QUEUE }),
    DemoItemModule,
    DemoFactoryProductionBridgeModule,
  ],
  providers: [DemoTickProcessor, DemoTickBootstrapService, DemoProjectCreatedListener],
})
export class DemoFactoryModule {}
