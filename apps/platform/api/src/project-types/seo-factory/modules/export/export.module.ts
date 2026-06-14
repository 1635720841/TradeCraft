/**
 * M10 导出模块。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [ProjectModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
