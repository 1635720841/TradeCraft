/**
 * 项目管理模块：项目 CRUD 与类型注册。
 */

import { Module } from '@nestjs/common';
import { OrgProjectController } from './org-project.controller';
import { ProjectAccessService } from './project-access.service';
import { ProjectAdminService } from './project-admin.service';
import { ProjectService } from './project.service';

@Module({
  controllers: [OrgProjectController],
  providers: [ProjectService, ProjectAccessService, ProjectAdminService],
  exports: [ProjectService, ProjectAccessService],
})
export class ProjectModule {}
