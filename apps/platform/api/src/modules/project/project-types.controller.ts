/**
 * 项目类型目录 HTTP 入口（计划路径别名）。
 */

import { Controller, Get } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { ProjectService } from './project.service';

@Controller('api/v1/project-types')
export class ProjectTypesController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @Permissions('project:read')
  async list(@ReqCtx() ctx: RequestContext) {
    return {
      data: this.projectService.listProjectTypes(),
      meta: { traceId: ctx.traceId },
    };
  }
}
