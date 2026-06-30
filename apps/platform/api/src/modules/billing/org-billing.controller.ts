/**
 * 租户计费用量 HTTP 入口。
 */

import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { BillingRequestService } from './billing-request.service';
import { BillingService } from './billing.service';
import { CreateBillingRequestDto } from './dto/create-billing-request.dto';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionPlanService } from './subscription-plan.service';

@Controller('api/v1/org/billing')
export class OrgBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly entitlementsService: EntitlementsService,
    private readonly billingRequestService: BillingRequestService,
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

  @Get('entitlements')
  @Permissions('org:billing:read')
  async getEntitlements(@ReqCtx() ctx: RequestContext) {
    const data = await this.entitlementsService.getForOrganization(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('requests')
  @Permissions('org:billing:read')
  async listRequests(@ReqCtx() ctx: RequestContext) {
    const data = await this.billingRequestService.listForOrg(ctx.organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('requests')
  @Permissions('org:billing:read')
  async createRequest(@ReqCtx() ctx: RequestContext, @Body() dto: CreateBillingRequestDto) {
    const data = await this.billingRequestService.create(ctx, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('usage/export')
  @Permissions('org:billing:read')
  async exportUsage(
    @ReqCtx() ctx: RequestContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const csv = await this.billingService.exportUsageCsv(ctx.organizationId, { from, to });
    res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res?.setHeader('Content-Disposition', 'attachment; filename="usage.csv"');
    return csv;
  }
}
