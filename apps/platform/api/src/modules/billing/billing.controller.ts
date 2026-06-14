/**
 * 计费用量查询 HTTP 入口。
 */

import { Controller, Get, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { BillingService } from './billing.service';

@Controller('api/v1/platform/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('usage')
  async listUsage(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.billingService.listUsage(
      ctx.organizationId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
        },
      },
    };
  }
}
