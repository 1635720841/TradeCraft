/**
 * demo-factory 演示项模块。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { DemoItemController } from './demo-item.controller';
import { DemoItemService } from './demo-item.service';

@Module({
  imports: [ProjectModule],
  controllers: [DemoItemController],
  providers: [DemoItemService],
  exports: [DemoItemService],
})
export class DemoItemModule {}
