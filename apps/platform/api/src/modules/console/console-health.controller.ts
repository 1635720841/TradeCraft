/**
 * Console 健康检查 HTTP 入口（管理端）。
 */

import { Controller, Get } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { ConsoleHealthService } from './console-health.service';

@Controller('api/v1/console/health')
export class ConsoleHealthController {
  constructor(private readonly healthService: ConsoleHealthService) {}

  @Get('queues')
  @Permissions('console:tenant:read')
  async queues(@ReqCtx() ctx: RequestContext) {
    const data = await this.healthService.getQueueHealth();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('providers')
  @Permissions('console:tenant:read')
  providers(@ReqCtx() ctx: RequestContext) {
    const data = this.healthService.getProviderHealth();
    return { data, meta: { traceId: ctx.traceId } };
  }
}
