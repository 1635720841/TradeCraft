/**
 * 平台运营控制台：概览、审计、计费审批与代登录。
 */

import { Injectable } from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AuditService } from '../access/audit.service';
import { BillingRequestService } from '../billing/billing-request.service';
import { JwtTokenService } from '../auth/jwt-token.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class ConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly billingRequestService: BillingRequestService,
    private readonly billingService: BillingService,
    private readonly auditService: AuditService,
  ) {}

  async getOverview() {
    const tenants = await this.prisma.organization.findMany({
      where: { type: OrganizationType.CUSTOMER },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        planName: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const highQuotaAlerts: Array<{
      id: string;
      name: string;
      usagePercent: number;
      remaining: number;
      periodQuota: number;
    }> = [];

    const quotaMap = await this.billingService.getQuotaSummariesForOrganizations(
      tenants.map((t) => t.id),
    );

    for (const tenant of tenants) {
      const quota = quotaMap.get(tenant.id);
      if (!quota?.periodQuota) continue;
      const usagePercent = Math.round((quota.reservedTotal / quota.periodQuota) * 100);
      if (usagePercent >= 80) {
        highQuotaAlerts.push({
          id: tenant.id,
          name: tenant.name,
          usagePercent,
          remaining: quota.remaining,
          periodQuota: quota.periodQuota,
        });
      }
    }

    highQuotaAlerts.sort((a, b) => b.usagePercent - a.usagePercent);

    return {
      highQuotaAlerts: highQuotaAlerts.slice(0, 10),
    };
  }

  listAuditLogs(
    page: number,
    limit: number,
    organizationId?: string,
    actorUserId?: string,
    actorKeyword?: string,
    action?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    return this.auditService.list({
      page,
      limit,
      organizationId,
      actorUserId,
      actorKeyword,
      action,
      dateFrom,
      dateTo,
    });
  }

  listBillingRequests() {
    return this.billingRequestService.listPending();
  }

  approveBillingRequest(requestId: string, reviewerId: string) {
    return this.billingRequestService.approve(requestId, reviewerId);
  }

  rejectBillingRequest(requestId: string, reviewerId: string) {
    return this.billingRequestService.reject(requestId, reviewerId);
  }

  async impersonate(
    actorUserId: string,
    traceId: string,
    input: { userId: string; reason: string },
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id: input.userId },
      select: { id: true, organizationId: true, role: true, email: true },
    });
    if (!target) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }

    const accessToken = this.jwtTokenService.signImpersonationToken({
      userId: target.id,
      organizationId: target.organizationId,
      role: target.role as Role,
      impersonatedBy: actorUserId,
    });

    await this.auditService.log({
      organizationId: target.organizationId,
      actorUserId,
      action: 'console.impersonate',
      targetType: 'User',
      targetId: target.id,
      metadata: { reason: input.reason, targetEmail: target.email },
      traceId,
    });

    return {
      accessToken,
      expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      targetEmail: target.email,
    };
  }
}
