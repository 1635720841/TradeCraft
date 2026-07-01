/**
 * Console ↔ SEO 工厂 GSC 桥接：向平台 Console 暴露 CONSOLE_GSC_PORT，避免 ConsoleModule 直接依赖 GscModule。
 */

import { Module } from '@nestjs/common';
import { CONSOLE_GSC_PORT } from '../../../../modules/console/console-gsc.port';
import { GscModule } from '../gsc/gsc.module';
import { GscService } from '../gsc/gsc.service';

@Module({
  imports: [GscModule],
  providers: [{ provide: CONSOLE_GSC_PORT, useExisting: GscService }],
  exports: [CONSOLE_GSC_PORT],
})
export class ConsoleGscBridgeModule {}
