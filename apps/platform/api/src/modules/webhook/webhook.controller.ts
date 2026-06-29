/**
 * Webhook HTTP 入口。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { WebhookService } from './webhook.service';

@Controller('api/v1/org/webhooks')
export class OrgWebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @Permissions('org:integration:manage')
  async list(@ReqCtx() ctx: RequestContext) {
    const data = await this.webhookService.list(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post()
  @Permissions('org:integration:manage')
  async create(
    @ReqCtx() ctx: RequestContext,
    @Body() body: { url: string; events: string[] },
  ) {
    const data = await this.webhookService.create(ctx.organizationId, body);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id')
  @Permissions('org:integration:manage')
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    const data = await this.webhookService.update(ctx.organizationId, id, body);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':id')
  @Permissions('org:integration:manage')
  async remove(@ReqCtx() ctx: RequestContext, @Param('id') id: string) {
    const data = await this.webhookService.remove(ctx.organizationId, id);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get(':id/deliveries')
  @Permissions('org:integration:manage')
  async listDeliveries(
    @ReqCtx() ctx: RequestContext,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.webhookService.listDeliveries(
      ctx.organizationId,
      id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }
}
