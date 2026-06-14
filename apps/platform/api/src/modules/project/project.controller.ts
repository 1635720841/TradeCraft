/**
 * 项目 HTTP 入口。
 *
 * 边界：
 * - 不负责：业务逻辑、数据库操作
 *
 * 入口：
 * - ProjectController
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { Role } from '@wm/shared-core';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectService } from './project.service';

@Controller('api/v1/platform/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.projectService.list(
      ctx.organizationId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
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
  async create(@ReqCtx() ctx: RequestContext, @Body() dto: CreateProjectDto) {
    const project = await this.projectService.create(ctx.organizationId, dto);
    return { data: project, meta: { traceId: ctx.traceId } };
  }

  @Get(':id')
  async getOne(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const project = await this.projectService.findOne(ctx.organizationId, id);
    return { data: project, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN)
  async archive(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const project = await this.projectService.archive(ctx.organizationId, id);
    return { data: project, meta: { traceId: ctx.traceId } };
  }
}
