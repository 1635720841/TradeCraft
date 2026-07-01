/**
 * 站内通知 HTTP 入口。
 */

import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { parsePageLimit } from '../../core/utils/parse-page-limit.util';
import { InAppNotificationService } from './in-app-notification.service';
import { UserNotificationPreferenceService } from './user-notification-preference.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Controller('api/v1/org/notifications')
export class OrgNotificationController {
  constructor(private readonly notifications: InAppNotificationService) {}

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const { limit: safeLimit } = parsePageLimit('1', limit, { page: 1, limit: 30 });
    const data = await this.notifications.list(
      ctx.userId,
      ctx.organizationId,
      safeLimit,
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

@Controller('api/v1/org/me/notification-preferences')
export class OrgNotificationPreferenceController {
  constructor(private readonly preferences: UserNotificationPreferenceService) {}

  @Get()
  async get(@ReqCtx() ctx: RequestContext) {
    const data = await this.preferences.get(ctx.userId, ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch()
  async update(
    @ReqCtx() ctx: RequestContext,
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    const data = await this.preferences.update(ctx.userId, ctx.organizationId, body);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
