/**
 * 企业资料与订阅：组织信息查询、租户资料更新、超管租户配置。
 */

import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AuditService } from '../access/audit.service';
import { tenantVisibleUserRoleFilter } from '../access/tenant-member-visibility';
import { BillingService } from '../billing/billing.service';
import { SubscriptionPlanService } from '../billing/subscription-plan.service';
import { assertValidPeriodRange } from '../billing/subscription.util';
import type { UpdateTenantDto } from '../console/dto/update-tenant.dto';
import type { UpdateOrgProfileDto } from './dto/update-org-profile.dto';

@Injectable()
export class OrganizationProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(organizationId: string, viewerRole?: Role) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        planId: true,
        planName: true,
        monthlyArticleQuota: true,
        articleQuotaBonus: true,
        subscriptionStatus: true,
        billingCycle: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        createdAt: true,
        _count: { select: { users: true, projects: true } },
      },
    });

    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '企业不存在');
    }

    const quota = await this.billingService.getQuotaSummary(organizationId);
    const memberCount = await this.prisma.user.count({
      where: { organizationId, ...tenantVisibleUserRoleFilter(viewerRole) },
    });

    return {
      id: org.id,
      type: org.type,
      status: org.status,
      name: org.name,
      planId: org.planId,
      planName: org.planName,
      monthlyArticleQuota: org.monthlyArticleQuota,
      articleQuotaBonus: org.articleQuotaBonus,
      subscriptionStatus: org.subscriptionStatus,
      billingCycle: org.billingCycle,
      currentPeriodStart: org.currentPeriodStart,
      currentPeriodEnd: org.currentPeriodEnd,
      memberCount,
      projectCount: org._count.projects,
      createdAt: org.createdAt,
      quota,
    };
  }

  /** 租户管理员：仅可改企业名称 */
  async updateProfile(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    dto: UpdateOrgProfileDto,
  ) {
    await this.ensureOrganization(organizationId);

    const data = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: dto.name?.trim() },
      select: {
        id: true,
        name: true,
        planName: true,
        monthlyArticleQuota: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.profile.update',
      targetType: 'Organization',
      targetId: organizationId,
      traceId,
    });

    return data;
  }

  /** 超管：更新租户订阅与状态 */
  async updateTenant(organizationId: string, dto: UpdateTenantDto) {
    await this.ensureOrganization(organizationId);

    if (dto.planName) {
      await this.subscriptionPlanService.applyPlan(organizationId, dto.planName.trim(), {
        billingCycle: dto.billingCycle,
        customQuota: dto.monthlyArticleQuota,
        resetPeriod: !dto.currentPeriodStart && !dto.currentPeriodEnd,
        subscriptionStatus: dto.subscriptionStatus,
        currentPeriodStart: dto.currentPeriodStart
          ? new Date(dto.currentPeriodStart)
          : undefined,
        currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : undefined,
      });
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.monthlyArticleQuota !== undefined && !dto.planName) {
      data.monthlyArticleQuota = dto.monthlyArticleQuota;
    }
    if (dto.billingCycle !== undefined && !dto.planName) data.billingCycle = dto.billingCycle;
    if (dto.subscriptionStatus !== undefined && !dto.planName) {
      data.subscriptionStatus = dto.subscriptionStatus;
    }
    if (dto.currentPeriodStart !== undefined) {
      data.currentPeriodStart = new Date(dto.currentPeriodStart);
    }
    if (dto.currentPeriodEnd !== undefined) {
      data.currentPeriodEnd = new Date(dto.currentPeriodEnd);
    }

    if (data.currentPeriodStart && data.currentPeriodEnd) {
      assertValidPeriodRange(
        data.currentPeriodStart as Date,
        data.currentPeriodEnd as Date,
      );
    }

    if (Object.keys(data).length === 0) {
      return this.getProfile(organizationId);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data,
    });

    return this.getProfile(organizationId);
  }

  /** 模块内：校验企业存在（成员服务等复用） */
  async ensureOrganization(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '企业不存在');
    }
  }
}
