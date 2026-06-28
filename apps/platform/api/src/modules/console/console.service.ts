/**
 * 平台运营控制台：跨租户管理。
 */

import { Injectable } from '@nestjs/common';
import { OrganizationType, Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { MenuService } from '../access/menu.service';
import { AuthService } from '../auth/auth.service';
import { BillingRequestService } from '../billing/billing-request.service';
import { JwtTokenService } from '../auth/jwt-token.service';
import { BillingService } from '../billing/billing.service';
import { SubscriptionPlanService } from '../billing/subscription-plan.service';
import { OrganizationService } from '../organization/organization.service';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class ConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly billingRequestService: BillingRequestService,
    private readonly organizationService: OrganizationService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly billingService: BillingService,
    private readonly accessService: AccessService,
    private readonly menuService: MenuService,
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

    const byStatus: Record<string, number> = {};
    for (const tenant of tenants) {
      byStatus[tenant.subscriptionStatus] = (byStatus[tenant.subscriptionStatus] ?? 0) + 1;
    }

    const highQuotaAlerts: Array<{
      id: string;
      name: string;
      usagePercent: number;
      remaining: number;
      periodQuota: number;
    }> = [];

    for (const tenant of tenants.slice(0, 50)) {
      const quota = await this.billingService.getQuotaSummary(tenant.id);
      if (!quota.periodQuota) continue;
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
      totalTenants: tenants.length,
      byStatus,
      highQuotaAlerts: highQuotaAlerts.slice(0, 10),
      recentTenants: tenants.slice(0, 5).map((t) => ({
        id: t.id,
        name: t.name,
        planName: t.planName,
        subscriptionStatus: t.subscriptionStatus,
      })),
    };
  }

  async listTenants(page: number, limit: number, keyword?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    const trimmed = keyword?.trim();

    const where = {
      type: OrganizationType.CUSTOMER,
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' as const } },
              {
                users: {
                  some: { email: { contains: trimmed, mode: 'insensitive' as const } },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          name: true,
          status: true,
          planId: true,
          planName: true,
          subscriptionStatus: true,
          billingCycle: true,
          monthlyArticleQuota: true,
          articleQuotaBonus: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          createdAt: true,
          users: {
            select: { email: true, name: true, role: true },
            orderBy: { createdAt: 'asc' },
          },
          _count: { select: { users: true, projects: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      items: items.map((org) => ({
        id: org.id,
        name: org.name,
        status: org.status,
        planId: org.planId,
        planName: org.planName,
        subscriptionStatus: org.subscriptionStatus,
        billingCycle: org.billingCycle,
        monthlyArticleQuota: org.monthlyArticleQuota,
        articleQuotaBonus: org.articleQuotaBonus,
        currentPeriodStart: org.currentPeriodStart,
        currentPeriodEnd: org.currentPeriodEnd,
        memberCount: org._count.users,
        projectCount: org._count.projects,
        createdAt: org.createdAt,
        accounts: org.users.map((user) => ({
          email: user.email,
          name: user.name,
          role: user.role,
        })),
      })),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async getTenant(organizationId: string) {
    await this.assertCustomerTenant(organizationId);
    const [profile, members] = await Promise.all([
      this.organizationService.getProfile(organizationId),
      this.organizationService.listMembers(organizationId),
    ]);
    return { ...profile, members };
  }

  async createTenant(actorUserId: string, traceId: string, dto: CreateTenantDto) {
    const email = dto.adminEmail.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '管理员邮箱已被注册');
    }

    const trialDefaults = await this.subscriptionPlanService.getTrialPlanDefaults();
    const org = await this.prisma.organization.create({
      data: {
        type: OrganizationType.CUSTOMER,
        name: dto.organizationName.trim(),
        ...trialDefaults,
      },
    });

    const planName = dto.planName?.trim() || 'trial';
    const hasCustomPeriod = !!(dto.currentPeriodStart && dto.currentPeriodEnd);
    await this.subscriptionPlanService.applyPlan(org.id, planName, {
      billingCycle: dto.billingCycle,
      customQuota: dto.monthlyArticleQuota,
      resetPeriod: !hasCustomPeriod,
      subscriptionStatus: dto.subscriptionStatus,
      currentPeriodStart: dto.currentPeriodStart
        ? new Date(dto.currentPeriodStart)
        : undefined,
      currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : undefined,
    });

    const adminUser = await this.prisma.user.create({
      data: {
        email,
        name: dto.adminName?.trim() || email.split('@')[0],
        passwordHash: this.authService.hashPassword(dto.adminPassword),
        organizationId: org.id,
        role: PrismaRole.ADMIN,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      organizationId: org.id,
      actorUserId,
      action: 'console.tenant.create',
      targetType: 'Organization',
      targetId: org.id,
      metadata: { adminEmail: email },
      traceId,
    });

    return {
      organization: await this.getTenant(org.id),
      adminUser,
    };
  }

  async updateTenant(
    actorUserId: string,
    traceId: string,
    organizationId: string,
    dto: UpdateTenantDto,
  ) {
    await this.assertCustomerTenant(organizationId);
    const data = await this.organizationService.updateTenant(organizationId, dto);

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'console.tenant.update',
      targetType: 'Organization',
      targetId: organizationId,
      metadata: { fields: Object.keys(dto) },
      traceId,
    });

    return data;
  }

  async renewTenantPeriod(actorUserId: string, traceId: string, organizationId: string) {
    await this.assertCustomerTenant(organizationId);
    const data = await this.subscriptionPlanService.renewCurrentPeriod(organizationId);
    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'console.tenant.renew',
      targetType: 'Organization',
      targetId: organizationId,
      traceId,
    });
    return data;
  }

  async addTenantQuotaTopUp(
    actorUserId: string,
    traceId: string,
    organizationId: string,
    amount: number,
    note?: string,
  ) {
    await this.assertCustomerTenant(organizationId);
    const data = await this.subscriptionPlanService.addQuotaTopUp(
      organizationId,
      amount,
      note,
    );
    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'console.tenant.quota-topup',
      targetType: 'Organization',
      targetId: organizationId,
      metadata: { amount, note },
      traceId,
    });
    return data;
  }

  async listUsers(page: number, limit: number, keyword?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    const trimmed = keyword?.trim();
    const where = trimmed
      ? {
          OR: [
            { email: { contains: trimmed, mode: 'insensitive' as const } },
            { name: { contains: trimmed, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          organization: { select: { id: true, name: true, type: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        organizationType: user.organization.type,
      })),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  getUserPermissions(userId: string) {
    return this.accessService.getUserPermissions(userId);
  }

  setUserPermissions(
    actorUserId: string,
    actorRole: Role,
    actorPermissions: readonly string[],
    targetUserId: string,
    permissionIds: string[],
    traceId?: string,
  ) {
    return this.accessService
      .setUserPermissions(
        actorUserId,
        actorRole,
        actorPermissions,
        targetUserId,
        permissionIds,
      )
      .then(async (result) => {
        await this.auditService.log({
          actorUserId,
          action: 'console.permission.grant',
          targetType: 'User',
          targetId: targetUserId,
          metadata: { permissionIds },
          traceId,
        });
        return result;
      });
  }

  async getUserMenus(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });
    if (!user) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }
    if (user.role === PrismaRole.SUPER_ADMIN || user.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '平台账号菜单不可配置');
    }

    const config = await this.menuService.getUserMenuConfig(userId, user.role as Role);
    return { user, customized: config.customized, menus: config.menus };
  }

  async setUserMenus(
    actorUserId: string,
    traceId: string,
    targetUserId: string,
    menuIds: string[],
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '用户不存在');
    }
    if (user.role === PrismaRole.SUPER_ADMIN || user.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '平台账号菜单不可配置');
    }

    const config = await this.menuService.setUserMenus(
      targetUserId,
      user.role as Role,
      menuIds,
      actorUserId,
    );

    await this.auditService.log({
      actorUserId,
      action: 'console.menu.update',
      targetType: 'User',
      targetId: targetUserId,
      metadata: { menuIds },
      traceId,
    });

    const fullUser = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });

    return {
      user: fullUser!,
      customized: true,
      menus: config.menus,
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

  private async assertCustomerTenant(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, type: OrganizationType.CUSTOMER },
      select: { id: true },
    });
    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '租户不存在');
    }
  }
}
