/**
 * 站内通知 HTTP 入口。
 */

import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { InAppNotificationService } from './in-app-notification.service';

@Controller('api/v1/org/notifications')
export class OrgNotificationController {
  constructor(private readonly notifications: InAppNotificationService) {}

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const data = await this.notifications.list(
      ctx.userId,
      ctx.organizationId,
      limit ? Number(limit) : 30,
      unreadOnly === '1' || unreadOnly === 'true',
    );
    const unread = await this.notifications.unreadCount(ctx.userId, ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId, unread } };
  }

  @Get('unread-count')
  async unreadCount(@ReqCtx() ctx: RequestContext) {
    const count = await this.notifications.unreadCount(ctx.userId, ctx.organizationId);
    return { data: { count }, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id/read')
  async markRead(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const data = await this.notifications.markRead(ctx.userId, ctx.organizationId, id);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('read-all')
  async markAllRead(@ReqCtx() ctx: RequestContext) {
    const data = await this.notifications.markAllRead(ctx.userId, ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
