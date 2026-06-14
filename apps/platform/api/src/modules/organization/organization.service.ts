/**
 * 企业服务：组织信息与成员管理。
 *
 * 边界：
 * - 不负责：登录鉴权（AuthService）
 *
 * 入口：
 * - OrganizationService
 */

import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly billingService: BillingService,
  ) {}

  async getProfile(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        planName: true,
        monthlyArticleQuota: true,
        createdAt: true,
        _count: { select: { users: true, projects: true } },
      },
    });

    if (!org) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '企业不存在');
    }

    const quota = await this.billingService.getQuotaSummary(organizationId);

    return {
      id: org.id,
      name: org.name,
      planName: org.planName,
      monthlyArticleQuota: org.monthlyArticleQuota,
      memberCount: org._count.users,
      projectCount: org._count.projects,
      createdAt: org.createdAt,
      quota,
    };
  }

  async updateProfile(organizationId: string, dto: UpdateOrganizationDto) {
    await this.ensureOrganization(organizationId);

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name?.trim(),
        planName: dto.planName?.trim(),
        monthlyArticleQuota: dto.monthlyArticleQuota,
      },
      select: {
        id: true,
        name: true,
        planName: true,
        monthlyArticleQuota: true,
        createdAt: true,
      },
    });
  }

  async listMembers(organizationId: string) {
    await this.ensureOrganization(organizationId);

    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMember(organizationId: string, dto: CreateMemberDto) {
    await this.ensureOrganization(organizationId);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '该邮箱已被注册');
    }

    return this.prisma.user.create({
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
        createdAt: true,
      },
    });
  }

  async updateMember(
    organizationId: string,
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

    if (dto.role && dto.role !== member.role) {
      await this.assertCanChangeRole(organizationId, member.role as Role, dto.role as Role);
    }

    return this.prisma.user.update({
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
        createdAt: true,
      },
    });
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
    if (currentRole === Role.ADMIN && nextRole === Role.MEMBER) {
      const adminCount = await this.prisma.user.count({
        where: { organizationId, role: PrismaRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new BusinessException(ErrorCodes.LAST_ADMIN_REQUIRED, '企业至少需要保留一名管理员');
      }
    }
  }
}
