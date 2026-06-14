/**
 * [模板] 功能模块注册。
 *
 * 边界：
 * - 不负责：[填写]
 *
 * 入口：
 * - TemplateModule
 */

import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

@Module({
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
