/**
 * 租户计费用量 HTTP 入口。
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { BillingService } from './billing.service';
import { AddQuotaTopUpDto } from './dto/add-quota-topup.dto';
import { SubscriptionPlanService } from './subscription-plan.service';

@Controller('api/v1/org/billing')
export class OrgBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
  ) {}

  @Get('plans')
  @Permissions('org:billing:read')
  async listPlans(@ReqCtx() ctx: RequestContext) {
    const data = await this.subscriptionPlanService.listActivePlans();
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Get('usage')
  @Permissions('org:billing:read')
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
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get('quota')
  @Permissions('org:billing:read')
  async getQuota(@ReqCtx() ctx: RequestContext) {
    const data = await this.billingService.getQuotaSummary(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('quota-topup')
  @Permissions('org:billing:manage')
  async addQuotaTopUp(@ReqCtx() ctx: RequestContext, @Body() dto: AddQuotaTopUpDto) {
    const data = await this.subscriptionPlanService.addQuotaTopUp(
      ctx.organizationId,
      dto.amount,
      dto.note,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('renew')
  @Permissions('org:billing:manage')
  async renewPeriod(@ReqCtx() ctx: RequestContext) {
    const data = await this.subscriptionPlanService.renewCurrentPeriod(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }
}

/** @deprecated */
@Controller('api/v1/platform/billing')
export class LegacyBillingController extends OrgBillingController {}
