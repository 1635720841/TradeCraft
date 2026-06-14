/**
 * 企业与成员 HTTP 入口。
 *
 * 边界：
 * - 不负责：业务细节（OrganizationService）
 *
 * 入口：
 * - OrganizationController
 */

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

@Controller('api/v1/platform/organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  async getProfile(@ReqCtx() ctx: RequestContext) {
    const data = await this.organizationService.getProfile(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch()
  @Roles(Role.ADMIN)
  async updateProfile(@ReqCtx() ctx: RequestContext, @Body() dto: UpdateOrganizationDto) {
    const data = await this.organizationService.updateProfile(ctx.organizationId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('members')
  @Roles(Role.ADMIN)
  async listMembers(@ReqCtx() ctx: RequestContext) {
    const data = await this.organizationService.listMembers(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Post('members')
  @Roles(Role.ADMIN)
  async createMember(@ReqCtx() ctx: RequestContext, @Body() dto: CreateMemberDto) {
    const data = await this.organizationService.createMember(ctx.organizationId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('members/:userId')
  @Roles(Role.ADMIN)
  async updateMember(
    @ReqCtx() ctx: RequestContext,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    const data = await this.organizationService.updateMember(
      ctx.organizationId,
      userId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
