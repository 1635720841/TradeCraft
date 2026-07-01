/**
 * Console GSC 集成管理 HTTP 入口（平台管理员统一授权与站点绑定）。
 */

import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { AuditService } from '../access/audit.service';
import { CONSOLE_GSC_PORT, type ConsoleGscPort } from './console-gsc.port';
import { parsePageLimit } from '../../core/utils/parse-page-limit.util';

@Controller('api/v1/console/gsc')
@Roles(Role.SUPER_ADMIN, Role.PLATFORM_OPERATOR)
export class ConsoleGscController {
  constructor(
    @Inject(CONSOLE_GSC_PORT) private readonly gscService: ConsoleGscPort,
    private readonly auditService: AuditService,
  ) {}

  @Get('status')
  @Permissions('console:gsc:manage')
  async status(@ReqCtx() ctx: RequestContext) {
    const data = await this.gscService.getPlatformStatus();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('connect-url')
  @Permissions('console:gsc:manage')
  async connectUrl(@ReqCtx() ctx: RequestContext) {
    const data = await this.gscService.createPlatformConnectUrl(ctx.userId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('disconnect')
  @Permissions('console:gsc:manage')
  async disconnect(@ReqCtx() ctx: RequestContext) {
    const data = await this.gscService.disconnectPlatform();
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.gsc.disconnect',
      targetType: 'PlatformGscCredential',
      targetId: 'default',
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('sites')
  @Permissions('console:gsc:manage')
  async listSites(
    @ReqCtx() ctx: RequestContext,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('keyword') keyword?: string,
    @Query('connected') connected?: 'true' | 'false',
  ) {
    const pagination = parsePageLimit(pageStr, limitStr);
    const result = await this.gscService.listConsoleSites({
      page: pagination.page,
      limit: pagination.limit,
      keyword,
      connected,
    });
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Post('auto-connect-all')
  @Permissions('console:gsc:manage')
  async autoConnectAll(@ReqCtx() ctx: RequestContext) {
    const data = await this.gscService.autoConnectAllUnconnected();
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.gsc.auto_connect_all',
      targetType: 'PlatformGscCredential',
      targetId: 'default',
      metadata: data as Record<string, unknown>,
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('sites/:siteId/connect')
  @Permissions('console:gsc:manage')
  async connectSite(@ReqCtx() ctx: RequestContext, @Param('siteId') siteId: string) {
    const data = await this.gscService.connectConsoleSite(siteId);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.gsc.site.connect',
      targetType: 'Site',
      targetId: siteId,
      metadata: data as Record<string, unknown>,
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('sites/:siteId/disconnect')
  @Permissions('console:gsc:manage')
  async disconnectSite(@ReqCtx() ctx: RequestContext, @Param('siteId') siteId: string) {
    const data = await this.gscService.disconnectConsoleSite(siteId);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.gsc.site.disconnect',
      targetType: 'Site',
      targetId: siteId,
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('sites/:siteId/sync')
  @Permissions('console:gsc:manage')
  async syncSite(@ReqCtx() ctx: RequestContext, @Param('siteId') siteId: string) {
    const data = await this.gscService.syncConsoleSite(siteId);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.gsc.site.sync',
      targetType: 'Site',
      targetId: siteId,
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }
}
