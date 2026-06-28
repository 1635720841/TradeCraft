/**
 * 企业管理 HTTP 入口（租户内，/api/v1/org）。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { SetUserPermissionsDto } from '../console/dto/set-user-permissions.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrgProfileDto } from './dto/update-org-profile.dto';
import { PermissionService } from '../access/permission.service';
import { AuditService } from '../access/audit.service';
import { AccessRequestService } from '../project/access-request.service';
import { MemberInviteService } from './member-invite.service';
import { OrganizationService } from './organization.service';

@Controller('api/v1/org')
export class OrgController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly permissionService: PermissionService,
    private readonly memberInviteService: MemberInviteService,
    private readonly auditService: AuditService,
    private readonly accessRequestService: AccessRequestService,
  ) {}

  @Get('permissions')
  @Permissions('org:member:grant')
  listPermissions(@ReqCtx() ctx: RequestContext) {
    const data = this.permissionService.listTenantCatalog();
    const accessMeta = this.permissionService.buildTenantAccessMeta();
    return {
      data,
      meta: {
        traceId: ctx.traceId,
        total: data.length,
        accessMeta: {
          roleDefaultPermissions: accessMeta.roleDefaultPermissions,
          permissionImplies: accessMeta.permissionImplies,
        },
      },
    };
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

  @Post('members/invite')
  @Permissions('org:member:create')
  async inviteMember(@ReqCtx() ctx: RequestContext, @Body() dto: InviteMemberDto) {
    const data = await this.memberInviteService.inviteMember(
      ctx.organizationId,
      ctx.userId,
      ctx.traceId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('members/:email/resend-invite')
  @Permissions('org:member:create')
  async resendInvite(@ReqCtx() ctx: RequestContext, @Param('email') email: string) {
    const data = await this.memberInviteService.resendInvite(
      ctx.organizationId,
      decodeURIComponent(email),
      ctx.userId,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete('members/:email/invite')
  @Permissions('org:member:create')
  async revokeInvite(@ReqCtx() ctx: RequestContext, @Param('email') email: string) {
    const data = await this.memberInviteService.revokeInvite(
      ctx.organizationId,
      decodeURIComponent(email),
      ctx.userId,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
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

  @Get('audit-logs')
  @Permissions('org:audit:read')
  async listAuditLogs(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
  ) {
    const result = await this.auditService.list({
      organizationId: ctx.organizationId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      action,
    });
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get('access-requests')
  @Permissions('project:update')
  async listAccessRequests(@ReqCtx() ctx: RequestContext) {
    const data = await this.accessRequestService.listPending(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Post('access-requests/:requestId/approve')
  @Permissions('project:update')
  async approveAccessRequest(
    @ReqCtx() ctx: RequestContext,
    @Param('requestId') requestId: string,
    @Body() body: { presetId?: string },
  ) {
    const data = await this.accessRequestService.approve(ctx, requestId, body.presetId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('access-requests/:requestId/reject')
  @Permissions('project:update')
  async rejectAccessRequest(
    @ReqCtx() ctx: RequestContext,
    @Param('requestId') requestId: string,
  ) {
    const data = await this.accessRequestService.reject(ctx, requestId);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
