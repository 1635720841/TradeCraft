/**
 * 项目管理模块：项目 CRUD 与类型注册。
 */

import { Module } from '@nestjs/common';
import { OrgProjectController } from './org-project.controller';
import { ProjectAccessService } from './project-access.service';
import { ProjectAdminService } from './project-admin.service';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  controllers: [ProjectController, OrgProjectController],
  providers: [ProjectService, ProjectAccessService, ProjectAdminService],
  exports: [ProjectService, ProjectAccessService],
})
export class ProjectModule {}
