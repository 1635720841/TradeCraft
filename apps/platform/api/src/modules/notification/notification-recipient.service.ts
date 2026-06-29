/**
 * 通知收件人解析：项目成员 + 企业管理员，排除平台账号。
 */

import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { isPlatformStaffOrgRole } from '../access/tenant-member-visibility';
import { ProjectAccessService } from '../project/project-access.service';
import { canReceiveJobActionNotifications } from '../project/project-notification.util';

export { canReceiveJobActionNotifications } from '../project/project-notification.util';

@Injectable()
export class NotificationRecipientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** 项目内持 seo:job:create 或 OWNER 的成员邮箱 */
  async listProjectJobNotifiableEmails(
    organizationId: string,
    projectId: string,
  ): Promise<string[]> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { projectType: true },
    });
    if (!project) return [];

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { email: true, role: true, status: true } } },
    });

    const emails: string[] = [];
    for (const member of members) {
      if (member.user.status !== 'ACTIVE') continue;
      if (isPlatformStaffOrgRole(member.user.role)) continue;

      const perms = await this.projectAccess.resolveMemberPermissions(
        member.id,
        member.role,
        project.projectType,
      );
      const canNotify =
        canReceiveJobActionNotifications(perms, member.role);
      if (canNotify && member.user.email) {
        emails.push(member.user.email);
      }
    }
    return [...new Set(emails)];
  }

  async listProjectJobNotifiableUserIds(
    organizationId: string,
    projectId: string,
  ): Promise<string[]> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { projectType: true },
    });
    if (!project) return [];

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, role: true, status: true } } },
    });

    const userIds: string[] = [];
    for (const member of members) {
      if (member.user.status !== 'ACTIVE') continue;
      if (isPlatformStaffOrgRole(member.user.role)) continue;

      const perms = await this.projectAccess.resolveMemberPermissions(
        member.id,
        member.role,
        project.projectType,
      );
      const canNotify =
        canReceiveJobActionNotifications(perms, member.role);
      if (canNotify) {
        userIds.push(member.user.id);
      }
    }
    return [...new Set(userIds)];
  }

  /** 企业 ADMIN 邮箱（配额告警） */
  async listOrgAdminEmails(organizationId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: PrismaRole.ADMIN,
        status: 'ACTIVE',
      },
      select: { email: true, role: true },
    });
    return [
      ...new Set(
        admins
          .filter((u) => !isPlatformStaffOrgRole(u.role))
          .map((u) => u.email)
          .filter(Boolean),
      ),
    ];
  }

  async listOrgAdminUserIds(organizationId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: PrismaRole.ADMIN,
        status: 'ACTIVE',
      },
      select: { id: true, role: true },
    });
    return admins.filter((u) => !isPlatformStaffOrgRole(u.role)).map((u) => u.id);
  }

  /** 项目内持 seo:job:review 或 seo:site:manage 的成员邮箱 */
  async listProjectReviewNotifiableEmails(
    organizationId: string,
    projectId: string,
  ): Promise<string[]> {
    const userIds = await this.listProjectReviewNotifiableUserIds(organizationId, projectId);
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, status: 'ACTIVE' },
      select: { email: true },
    });
    return [...new Set(users.map((u) => u.email).filter(Boolean))];
  }

  async listProjectReviewNotifiableUserIds(
    organizationId: string,
    projectId: string,
  ): Promise<string[]> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { projectType: true },
    });
    if (!project) return [];

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, role: true, status: true } } },
    });

    const userIds: string[] = [];
    for (const member of members) {
      if (member.user.status !== 'ACTIVE') continue;
      if (isPlatformStaffOrgRole(member.user.role)) continue;

      const perms = await this.projectAccess.resolveMemberPermissions(
        member.id,
        member.role,
        project.projectType,
      );
      if (
        perms.includes('seo:job:review') ||
        perms.includes('seo:site:manage') ||
        member.role === 'OWNER'
      ) {
        userIds.push(member.user.id);
      }
    }
    return [...new Set(userIds)];
  }
}
