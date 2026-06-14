/**
 * 项目管理模块：项目 CRUD 与类型注册。
 *
 * 边界：
 * - 不负责：项目类型插件内部业务
 */

import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
