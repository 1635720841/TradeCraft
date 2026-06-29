/**
 * 钉钉/飞书机器人通道 HTTP 入口。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { OrgRobotChannelService } from './org-robot-channel.service';

@Controller('api/v1/org/robot-channels')
export class OrgRobotChannelController {
  constructor(private readonly robotChannels: OrgRobotChannelService) {}

  @Get()
  @Permissions('org:integration:manage')
  async list(@ReqCtx() ctx: RequestContext) {
    const data = await this.robotChannels.list(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post()
  @Permissions('org:integration:manage')
  async create(
    @ReqCtx() ctx: RequestContext,
    @Body() body: { channelType: string; webhookUrl: string; events: string[] },
  ) {
    const data = await this.robotChannels.create(ctx.organizationId, body);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id')
  @Permissions('org:integration:manage')
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('id') id: string,
    @Body()
    body: { channelType?: string; webhookUrl?: string; events?: string[]; isActive?: boolean },
  ) {
    const data = await this.robotChannels.update(ctx.organizationId, id, body);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':id')
  @Permissions('org:integration:manage')
  async remove(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const data = await this.robotChannels.remove(ctx.organizationId, id);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
