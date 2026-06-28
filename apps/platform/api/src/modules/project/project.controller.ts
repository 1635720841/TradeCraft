/**
 * 项目 HTTP 入口。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { Role } from '@wm/shared-core';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectService } from './project.service';

@Controller('api/v1/platform/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @Permissions('project:read')
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.projectService.list(
      ctx.organizationId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      ctx,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Post()
  @Roles(Role.ADMIN)
  @Permissions('project:create')
  async create(@ReqCtx() ctx: RequestContext, @Body() dto: CreateProjectDto) {
    const project = await this.projectService.create(
      ctx.organizationId,
      dto,
      ctx.userId,
      ctx.traceId,
    );
    return { data: project, meta: { traceId: ctx.traceId } };
  }

  @Get(':id')
  @Permissions('project:read')
  async getOne(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const project = await this.projectService.findOne(ctx.organizationId, id, ctx);
    return { data: project, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN)
  @Permissions('project:update')
  async archive(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const project = await this.projectService.archive(ctx.organizationId, id, ctx);
    return { data: project, meta: { traceId: ctx.traceId } };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @Permissions('project:update')
  async remove(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const data = await this.projectService.remove(ctx.organizationId, id, {
      userId: ctx.userId,
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }
}
