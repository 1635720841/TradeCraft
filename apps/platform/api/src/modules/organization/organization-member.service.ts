/**
 * 企业成员管理：列表、创建、更新、禁用与权限授予。
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
import { PLATFORM_STAFF_PRISMA_ROLES } from '../access/tenant-member-visibility';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';
import type { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { OrganizationProfileService } from './organization-profile.service';

const MEMBER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class OrganizationMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
    private readonly organizationProfileService: OrganizationProfileService,
  ) {}

  async listMembers(
    organizationId: string,
    viewerRole?: Role,
    options?: { page?: number; limit?: number },
  ) {
    await this.organizationProfileService.ensureOrganization(organizationId);

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 50));

    const where: { organizationId: string; role?: { notIn: PrismaRole[] } } = {
      organizationId,
    };
    if (viewerRole !== Role.SUPER_ADMIN) {
      where.role = { notIn: [...PLATFORM_STAFF_PRISMA_ROLES] };
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, page, limit, total };
  }

  async createMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    dto: CreateMemberDto,
  ) {
    await this.organizationProfileService.ensureOrganization(organizationId);

    const email = dto.email.trim().toLowerCase();
    const role = (dto.role ?? PrismaRole.MEMBER) as PrismaRole;
    const name = dto.name?.trim() || email.split('@')[0];
    const passwordHash = this.authService.hashPassword(dto.password);

    const existing = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, organizationId: true, status: true },
    });

    if (existing) {
      if (existing.organizationId !== organizationId) {
        throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '该邮箱已在其他企业注册');
      }
      if (existing.status === 'ACTIVE') {
        throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '该邮箱已是企业成员');
      }

      const member = await this.prisma.$transaction(async (tx) => {
        await tx.memberInvite.updateMany({
          where: { organizationId, email, revokedAt: null, acceptedAt: null },
          data: { revokedAt: new Date() },
        });

        return tx.user.update({
          where: { id: existing.id },
          data: {
            name,
            role,
            status: 'ACTIVE',
            passwordHash,
          },
          select: MEMBER_SELECT,
        });
      });

      await this.auditService.log({
        organizationId,
        actorUserId,
        action: 'org.member.create',
        targetType: 'User',
        targetId: member.id,
        metadata: { email, reactivated: true },
        traceId,
      });

      return member;
    }

    const member = await this.prisma.user.create({
      data: {
        email,
        name,
        organizationId,
        role,
        passwordHash,
      },
      select: MEMBER_SELECT,
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
      select: MEMBER_SELECT,
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

  async updateMemberStatus(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    userId: string,
    status: UpdateMemberStatusDto['status'],
  ) {
    if (actorUserId === userId && status === 'DISABLED') {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '不能禁用自己');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, role: true, status: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.MEMBER_NOT_FOUND, '成员不存在');
    }

    if (member.role === PrismaRole.SUPER_ADMIN || member.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '平台账号不可通过企业管理修改');
    }

    if (status === 'DISABLED' && member.role === PrismaRole.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({
        where: { organizationId, role: PrismaRole.ADMIN, status: 'ACTIVE' },
      });
      if (activeAdminCount <= 1) {
        throw new BusinessException(ErrorCodes.LAST_ADMIN_REQUIRED, '企业至少需要保留一名启用的企业管理员');
      }
    }

    if (member.status === status) {
      return this.prisma.user.findFirstOrThrow({
        where: { id: userId },
        select: MEMBER_SELECT,
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: MEMBER_SELECT,
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: status === 'DISABLED' ? 'org.member.disable' : 'org.member.enable',
      targetType: 'User',
      targetId: userId,
      traceId,
    });

    return updated;
  }

  async removeMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    userId: string,
  ) {
    if (actorUserId === userId) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '不能删除自己');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.MEMBER_NOT_FOUND, '成员不存在');
    }

    if (member.role === PrismaRole.SUPER_ADMIN || member.role === PrismaRole.PLATFORM_OPERATOR) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '平台账号不可通过企业管理删除');
    }

    if (member.role === PrismaRole.ADMIN && member.status === 'ACTIVE') {
      const activeAdminCount = await this.prisma.user.count({
        where: { organizationId, role: PrismaRole.ADMIN, status: 'ACTIVE' },
      });
      if (activeAdminCount <= 1) {
        throw new BusinessException(ErrorCodes.LAST_ADMIN_REQUIRED, '企业至少需要保留一名启用的企业管理员');
      }
    }

    await this.prisma.$transaction([
      this.prisma.memberInvite.deleteMany({
        where: { organizationId, email: member.email },
      }),
      this.prisma.userNotification.deleteMany({
        where: { organizationId, userId },
      }),
      this.prisma.userNotificationPreference.deleteMany({
        where: { organizationId, userId },
      }),
      this.prisma.projectAccessRequest.deleteMany({
        where: { organizationId, userId },
      }),
      this.prisma.articleJobAssignee.deleteMany({
        where: { organizationId, userId },
      }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.member.delete',
      targetType: 'User',
      targetId: userId,
      metadata: { email: member.email },
      traceId,
    });

    return { id: userId, email: member.email };
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
