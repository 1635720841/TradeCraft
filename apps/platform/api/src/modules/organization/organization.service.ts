/**
 * 企业服务：组织信息与成员管理（租户内）。
 */

import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import { SubscriptionPlanService } from '../billing/subscription-plan.service';
import { assertValidPeriodRange } from '../billing/subscription.util';
import {
  PLATFORM_STAFF_PRISMA_ROLES,
  tenantVisibleUserRoleFilter,
} from '../access/tenant-member-visibility';
import type { UpdateTenantDto } from '../console/dto/update-tenant.dto';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';
import type { UpdateOrgProfileDto } from './dto/update-org-profile.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly billingService: BillingService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly accessService: AccessService,
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

  async listMembers(organizationId: string, viewerRole?: Role) {
    await this.ensureOrganization(organizationId);

    const where: { organizationId: string; role?: { notIn: PrismaRole[] } } = {
      organizationId,
    };
    if (viewerRole !== Role.SUPER_ADMIN) {
      where.role = { notIn: [...PLATFORM_STAFF_PRISMA_ROLES] };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    dto: CreateMemberDto,
  ) {
    await this.ensureOrganization(organizationId);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '该邮箱已被注册');
    }

    const member = await this.prisma.user.create({
      data: {
        email,
        name: dto.name?.trim() || email.split('@')[0],
        organizationId,
        role: (dto.role ?? PrismaRole.MEMBER) as PrismaRole,
        passwordHash: this.authService.hashPassword(dto.password),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.member.create',
      targetType: 'User',
      targetId: member.id,
      metadata: { email },
      traceId,
    });

    return member;
  }

  async updateMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    userId: string,
    dto: UpdateMemberDto,
  ) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.MEMBER_NOT_FOUND, '成员不存在');
    }

    if (member.role === PrismaRole.SUPER_ADMIN || member.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '平台账号不可通过企业管理修改');
    }

    if (dto.role && dto.role !== member.role) {
      await this.assertCanChangeRole(organizationId, member.role as Role, dto.role as Role);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name?.trim(),
        role: dto.role as PrismaRole | undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.member.update',
      targetType: 'User',
      targetId: userId,
      traceId,
    });

    return updated;
  }

  getMemberPermissions(organizationId: string, userId: string, viewerRole?: Role) {
    return this.assertTenantVisibleMember(organizationId, userId, viewerRole).then(() =>
      this.accessService.getUserPermissions(userId, organizationId),
    );
  }

  setMemberPermissions(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    actorPermissions: readonly string[],
    targetUserId: string,
    permissionIds: string[],
    traceId: string,
  ) {
    return this.accessService
      .setUserPermissions(
        actorUserId,
        actorRole,
        actorPermissions,
        targetUserId,
        permissionIds,
        organizationId,
      )
      .then(async (result) => {
        await this.auditService.log({
          organizationId,
          actorUserId,
          action: 'org.member.grant',
          targetType: 'User',
          targetId: targetUserId,
          metadata: { permissionIds },
          traceId,
        });
        return result;
      });
  }

  private async assertTenantVisibleMember(
    organizationId: string,
    userId: string,
    viewerRole?: Role,
  ) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.MEMBER_NOT_FOUND, '成员不存在');
    }

    if (
      viewerRole !== Role.SUPER_ADMIN &&
      (member.role === PrismaRole.SUPER_ADMIN || member.role === PrismaRole.PLATFORM_OPERATOR)
    ) {
      throw new BusinessException(ErrorCodes.MEMBER_NOT_FOUND, '成员不存在');
    }

    return member;
  }

  private async ensureOrganization(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '企业不存在');
    }
  }

  private async assertCanChangeRole(
    organizationId: string,
    currentRole: Role,
    nextRole: Role,
  ) {
    if (currentRole === Role.SUPER_ADMIN || nextRole === Role.SUPER_ADMIN) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '超级管理员角色不可变更');
    }

    if (currentRole === Role.PLATFORM_OPERATOR || nextRole === Role.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '平台管理员角色不可变更');
    }

    if (currentRole === Role.ADMIN && nextRole === Role.MEMBER) {
      const adminCount = await this.prisma.user.count({
        where: { organizationId, role: PrismaRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new BusinessException(ErrorCodes.LAST_ADMIN_REQUIRED, '企业至少需要保留一名企业管理员');
      }
    }
  }
}
