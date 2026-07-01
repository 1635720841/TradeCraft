/**
 * Console 健康检查 HTTP 入口（管理端）。
 */

import { Controller, Get, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ConsoleHealthService } from './console-health.service';
import { parsePageLimit } from '../../core/utils/parse-page-limit.util';

@Controller('api/v1/console/health')
@Roles(Role.SUPER_ADMIN, Role.PLATFORM_OPERATOR)
export class ConsoleHealthController {
  constructor(private readonly healthService: ConsoleHealthService) {}

  @Get('queues')
  @Permissions('console:health:read')
  async queues(@ReqCtx() ctx: RequestContext) {
    const data = await this.healthService.getQueueHealth();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('queue-jobs')
  @Permissions('console:health:read')
  async queueJobs(
    @ReqCtx() ctx: RequestContext,
    @Query('state') state?: 'waiting' | 'active' | 'delayed' | 'failed' | 'all',
    @Query('queue') queue?: string,
    @Query('limit') limit?: string,
  ) {
    const { limit: safeLimit } = parsePageLimit('1', limit, { page: 1, limit: 50 });
    const data = await this.healthService.getQueueJobs({
      state,
      queue: queue?.trim() || undefined,
      limit: safeLimit,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('providers')
  @Permissions('console:health:read')
  providers(@ReqCtx() ctx: RequestContext) {
    const data = this.healthService.getProviderHealth();
    return { data, meta: { traceId: ctx.traceId } };
  }
}
