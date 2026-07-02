/**
 * Console 租户管理：跨租户 CRUD 与配额操作。
 */

import { Injectable } from '@nestjs/common';
import { OrganizationType, Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AuditService } from '../access/audit.service';
import { AuthService } from '../auth/auth.service';
import { SubscriptionPlanService } from '../billing/subscription-plan.service';
import { OrganizationService } from '../organization/organization.service';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class ConsoleTenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly organizationService: OrganizationService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly auditService: AuditService,
  ) {}

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

  async listTenantProjects(organizationId: string) {
    await this.assertCustomerTenant(organizationId);
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        projectType: true,
        status: true,
        createdAt: true,
        _count: { select: { sites: true } },
      },
    });
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      projectType: project.projectType,
      status: project.status,
      siteCount: project._count.sites,
      createdAt: project.createdAt,
    }));
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
