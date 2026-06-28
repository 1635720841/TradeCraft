/**
 * 企业项目管理 HTTP 入口（访问期、成员、项目内权限）。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { SetProjectMemberPermissionsDto } from './dto/set-project-member-permissions.dto';
import { UpdateProjectAccessDto } from './dto/update-project-access.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { ProjectAdminService } from './project-admin.service';
import { ProjectService } from './project.service';

@Controller('api/v1/org/projects')
export class OrgProjectController {
  constructor(
    private readonly projectAdminService: ProjectAdminService,
    private readonly projectService: ProjectService,
  ) {}

  @Get()
  @Permissions('project:read')
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.projectAdminService.listManagedProjects(
      ctx,
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

  @Get(':projectId')
  @Permissions('project:read')
  async getOne(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    const data = await this.projectAdminService.getManagedProject(ctx, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':projectId')
  @Permissions('project:update')
  async updateAccess(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectAccessDto,
  ) {
    const data = await this.projectAdminService.updateProjectAccess(ctx, projectId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':projectId')
  @Permissions('project:update')
  async remove(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    const data = await this.projectAdminService.removeProject(ctx, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get(':projectId/members')
  @Permissions('project:read')
  async listMembers(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.projectAdminService.listMembers(ctx, projectId);
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Post(':projectId/members')
  @Permissions('project:update')
  async addMember(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    const data = await this.projectAdminService.addMember(ctx, projectId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':projectId/members/:userId')
  @Permissions('project:update')
  async updateMember(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto,
  ) {
    const data = await this.projectAdminService.updateMember(
      ctx,
      projectId,
      userId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':projectId/members/:userId')
  @Permissions('project:update')
  async removeMember(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    const data = await this.projectAdminService.removeMember(ctx, projectId, userId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get(':projectId/members/:userId/permissions')
  @Permissions('project:update')
  async getMemberPermissions(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    const data = await this.projectAdminService.getMemberPermissions(
      ctx,
      projectId,
      userId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Put(':projectId/members/:userId/permissions')
  @Permissions('project:update')
  async setMemberPermissions(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: SetProjectMemberPermissionsDto,
  ) {
    const data = await this.projectAdminService.setMemberPermissions(
      ctx,
      projectId,
      userId,
      dto.permissionIds,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
