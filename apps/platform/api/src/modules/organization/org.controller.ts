/**
 * 企业管理 HTTP 入口（租户内，/api/v1/org）。
 */

import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { SetUserPermissionsDto } from '../console/dto/set-user-permissions.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrgProfileDto } from './dto/update-org-profile.dto';
import { PermissionService } from '../access/permission.service';
import { OrganizationService } from './organization.service';

@Controller('api/v1/org')
export class OrgController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get('permissions')
  @Permissions('org:member:grant')
  listPermissions(@ReqCtx() ctx: RequestContext) {
    const data = this.permissionService.listCatalog();
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Get('profile')
  @Permissions('org:profile:read')
  async getProfile(@ReqCtx() ctx: RequestContext) {
    const data = await this.organizationService.getProfile(ctx.organizationId, ctx.role);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('profile')
  @Permissions('org:profile:update')
  async updateProfile(@ReqCtx() ctx: RequestContext, @Body() dto: UpdateOrgProfileDto) {
    const data = await this.organizationService.updateProfile(
      ctx.organizationId,
      ctx.userId,
      ctx.traceId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('members')
  @Permissions('org:member:list')
  async listMembers(@ReqCtx() ctx: RequestContext) {
    const data = await this.organizationService.listMembers(ctx.organizationId, ctx.role);
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Post('members')
  @Permissions('org:member:create')
  async createMember(@ReqCtx() ctx: RequestContext, @Body() dto: CreateMemberDto) {
    const data = await this.organizationService.createMember(
      ctx.organizationId,
      ctx.userId,
      ctx.traceId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('members/:userId')
  @Permissions('org:member:update')
  async updateMember(
    @ReqCtx() ctx: RequestContext,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    const data = await this.organizationService.updateMember(
      ctx.organizationId,
      ctx.userId,
      ctx.traceId,
      userId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('members/:userId/permissions')
  @Permissions('org:member:grant')
  async getMemberPermissions(
    @ReqCtx() ctx: RequestContext,
    @Param('userId') userId: string,
  ) {
    const data = await this.organizationService.getMemberPermissions(
      ctx.organizationId,
      userId,
      ctx.role,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Put('members/:userId/permissions')
  @Permissions('org:member:grant')
  async setMemberPermissions(
    @ReqCtx() ctx: RequestContext,
    @Param('userId') userId: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    const data = await this.organizationService.setMemberPermissions(
      ctx.organizationId,
      ctx.userId,
      ctx.role,
      ctx.permissions,
      userId,
      dto.permissionIds,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}

/** @deprecated 兼容旧路径 */
@Controller('api/v1/platform/organization')
export class LegacyOrganizationController extends OrgController {}
