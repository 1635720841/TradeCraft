/**
 * 续费/升级申请服务。
 */

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingRequestType } from '@prisma/client';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import {
  BILLING_REQUEST_CREATED_EVENT,
  type BillingRequestCreatedPayload,
} from '../../core/event-bus/events';
import { AuditService } from '../access/audit.service';
import { SubscriptionPlanService } from './subscription-plan.service';

@Injectable()
export class BillingRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  async create(
    ctx: RequestContext,
    input: {
      type: BillingRequestType;
      targetPlanId?: string;
      topUpAmount?: number;
      message?: string;
    },
  ) {
    const pending = await this.prisma.billingChangeRequest.findFirst({
      where: { organizationId: ctx.organizationId, status: 'PENDING' },
    });
    if (pending) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '已有待审批的申请');
    }

    const request = await this.prisma.billingChangeRequest.create({
      data: {
        organizationId: ctx.organizationId,
        requestedById: ctx.userId,
        type: input.type,
        targetPlanId: input.targetPlanId,
        topUpAmount: input.topUpAmount,
        message: input.message?.trim(),
      },
    });

    this.eventEmitter.emit(BILLING_REQUEST_CREATED_EVENT, {
      organizationId: ctx.organizationId,
      requestId: request.id,
      type: input.type,
      requestedById: ctx.userId,
    } satisfies BillingRequestCreatedPayload);

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'org.billing.request.create',
      targetType: 'BillingChangeRequest',
      targetId: request.id,
      metadata: { type: input.type },
      traceId: ctx.traceId,
    });

    return request;
  }

  async listForOrg(organizationId: string, options?: { page?: number; limit?: number }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const where = { organizationId };
    const [total, items] = await Promise.all([
      this.prisma.billingChangeRequest.count({ where }),
      this.prisma.billingChangeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, page, limit, total };
  }

  async listPending() {
    const items = await this.prisma.billingChangeRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (items.length === 0) return [];

    const orgIds = [...new Set(items.map((i) => i.organizationId))];
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, planName: true },
    });
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    return items.map((item) => ({
      ...item,
      organizationName: orgMap.get(item.organizationId)?.name ?? item.organizationId,
      currentPlanName: orgMap.get(item.organizationId)?.planName ?? null,
    }));
  }

  async approve(requestId: string, reviewerId: string, traceId?: string) {
    const request = await this.prisma.billingChangeRequest.findFirst({
      where: { id: requestId, status: 'PENDING' },
    });
    if (!request) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '申请不存在');
    }

    if (request.type === 'RENEW') {
      await this.subscriptionPlanService.renewCurrentPeriod(request.organizationId);
    } else if (request.type === 'UPGRADE' && request.targetPlanId) {
      await this.subscriptionPlanService.applyPlan(request.organizationId, request.targetPlanId);
    } else if (request.type === 'TOPUP' && request.topUpAmount) {
      await this.subscriptionPlanService.addQuotaTopUp(
        request.organizationId,
        request.topUpAmount,
      );
    }

    const updated = await this.prisma.billingChangeRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() },
    });

    await this.auditService.log({
      organizationId: request.organizationId,
      actorUserId: reviewerId,
      action: 'console.billing.request.approve',
      targetType: 'BillingChangeRequest',
      targetId: requestId,
      traceId,
    });

    return updated;
  }

  async reject(requestId: string, reviewerId: string, traceId?: string) {
    const request = await this.prisma.billingChangeRequest.findFirst({
      where: { id: requestId, status: 'PENDING' },
    });
    if (!request) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '申请不存在');
    }

    const updated = await this.prisma.billingChangeRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date() },
    });

    await this.auditService.log({
      organizationId: request.organizationId,
      actorUserId: reviewerId,
      action: 'console.billing.request.reject',
      targetType: 'BillingChangeRequest',
      targetId: requestId,
      traceId,
    });

    return updated;
  }
}
