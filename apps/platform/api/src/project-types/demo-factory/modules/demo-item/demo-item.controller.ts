/**
 * demo-factory 演示项 HTTP 入口。
 */

import { Controller, Get, Param } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectAccessService } from '../../../../modules/project/project-access.service';
import { ProjectService } from '../../../../modules/project/project.service';
import { DemoItemService } from './demo-item.service';

@Controller('api/v1/projects/:projectId/demo-factory/items')
export class DemoItemController {
  constructor(
    private readonly demoItemService: DemoItemService,
    private readonly projectAccess: ProjectAccessService,
    private readonly projectService: ProjectService,
  ) {}

  @Get()
  async list(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    const project = await this.projectService.findOne(ctx.organizationId, projectId, ctx);
    await this.projectAccess.assertWorkbenchEnterable(ctx, project);
    await this.projectAccess.assertMemberHasAnyPermission(ctx, project, ['project:read']);
    await this.demoItemService.ensureSeed(ctx.organizationId, projectId);
    const data = await this.demoItemService.list(ctx.organizationId, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
