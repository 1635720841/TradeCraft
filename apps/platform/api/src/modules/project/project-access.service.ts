/**
 * 项目访问与成员权限解析。
 */

import { Injectable } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { Role, type RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { PERMISSION_CATALOG } from '../access/permission.constants';
import {
  isWithinAccessWindow,
  listGrantablePermissionsForProjectType,
  resolveProjectListAccessMeta,
  resolveProjectMemberRoleDefaults,
} from './project-access.constants';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isOrgProjectAdmin(role: Role): boolean {
    return role === Role.SUPER_ADMIN || role === Role.ADMIN;
  }

  assertProjectAccessWindow(
    accessStart: Date | null,
    accessEnd: Date | null,
    message = '项目不在开放时间内',
  ): void {
    if (!isWithinAccessWindow(accessStart, accessEnd)) {
      throw new BusinessException(ErrorCodes.PROJECT_ACCESS_EXPIRED, message);
    }
  }

  async assertUserCanUseProject(
    ctx: Pick<RequestContext, 'userId' | 'role'>,
    project: {
      id: string;
      projectType: string;
      accessStart: Date | null;
      accessEnd: Date | null;
    },
  ): Promise<void> {
    if (ctx.role === Role.SUPER_ADMIN || ctx.role === Role.PLATFORM_OPERATOR) {
      return;
    }

    this.assertProjectAccessWindow(
      project.accessStart,
      project.accessEnd,
      '项目不在开放时间内，请联系管理员',
    );

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: ctx.userId } },
      select: { id: true, role: true, accessStart: true, accessEnd: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '您不是该项目成员');
    }

    if (!isWithinAccessWindow(member.accessStart, member.accessEnd)) {
      throw new BusinessException(ErrorCodes.PROJECT_ACCESS_EXPIRED, '您的项目访问权限已过期');
    }
  }

  /** 禁止纯只读成员修改项目资源（媒体库等跨类型能力） */
  async assertMemberCanMutateProject(
    ctx: Pick<RequestContext, 'userId' | 'role'>,
    project: { id: string },
  ): Promise<void> {
    if (
      ctx.role === Role.SUPER_ADMIN ||
      ctx.role === Role.PLATFORM_OPERATOR
    ) {
      return;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: ctx.userId } },
      select: { role: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '您不是该项目成员');
    }

    if (member.role === ProjectMemberRole.VIEWER) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '只读成员无法上传或删除文件');
    }
  }

  /** 校验项目成员是否具备任一指定权限（SUPER_ADMIN 跳过） */
  async assertMemberHasAnyPermission(
    ctx: Pick<RequestContext, 'userId' | 'role'>,
    project: { id: string; projectType: string },
    required: readonly string[],
  ): Promise<void> {
    if (
      ctx.role === Role.SUPER_ADMIN ||
      ctx.role === Role.PLATFORM_OPERATOR ||
      required.length === 0
    ) {
      return;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: ctx.userId } },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '您不是该项目成员');
    }

    const effective = await this.resolveMemberPermissions(
      member.id,
      member.role,
      project.projectType,
    );
    const allowed = required.some((id) => effective.includes(id));
    if (!allowed) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '无权执行此操作');
    }
  }

  async resolveMemberPermissions(
    memberId: string,
    role: ProjectMemberRole,
    projectType: string,
  ): Promise<string[]> {
    const grants = await this.prisma.projectMemberPermission.findMany({
      where: { memberId },
      select: { permissionId: true },
    });
    const defaults = resolveProjectMemberRoleDefaults(role, projectType);
    return [...new Set([...defaults, ...grants.map((g) => g.permissionId)])];
  }

  async getMemberAccessSummary(
    projectId: string,
    userId: string,
    projectType: string,
  ) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        permissions: { select: { permissionId: true } },
      },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.PROJECT_MEMBER_NOT_FOUND, '项目成员不存在');
    }

    const grants = member.permissions.map((p) => p.permissionId);
    const effectivePermissions = await this.resolveMemberPermissions(
      member.id,
      member.role,
      projectType,
    );
    const grantableIds = listGrantablePermissionsForProjectType(projectType);
    const catalogById = new Map(PERMISSION_CATALOG.map((item) => [item.id, item]));

    return {
      member: {
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        orgRole: member.user.role,
        role: member.role,
        accessStart: member.accessStart,
        accessEnd: member.accessEnd,
      },
      grants,
      effectivePermissions,
      grantablePermissionIds: grantableIds,
      roleDefaultPermissionIds: resolveProjectMemberRoleDefaults(member.role, projectType),
      grantablePermissions: grantableIds.map((id) => {
        const def = catalogById.get(id);
        return {
          id,
          name: def?.name ?? id,
          description: def?.description,
        };
      }),
    };
  }

  async setMemberPermissions(
    memberId: string,
    projectType: string,
    permissionIds: string[],
  ): Promise<string[]> {
    const allowed = new Set(listGrantablePermissionsForProjectType(projectType));
    const unique = [...new Set(permissionIds.filter((id) => allowed.has(id)))];

    await this.prisma.$transaction([
      this.prisma.projectMemberPermission.deleteMany({ where: { memberId } }),
      ...unique.map((permissionId) =>
        this.prisma.projectMemberPermission.create({
          data: { memberId, permissionId },
        }),
      ),
    ]);

    const member = await this.prisma.projectMember.findUniqueOrThrow({
      where: { id: memberId },
      select: { role: true },
    });

    return this.resolveMemberPermissions(memberId, member.role, projectType);
  }

  async ensureOwnerOnCreate(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: {
        projectId,
        userId,
        role: ProjectMemberRole.OWNER,
        grantedById: userId,
      },
      update: {},
    });
  }

  async listAccessibleProjectIds(userId: string, organizationId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId, project: { organizationId } },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  async enrichProjectListItems<
    T extends {
      id: string;
      status: string;
      accessStart: Date | null;
      accessEnd: Date | null;
    },
  >(items: T[], ctx: Pick<RequestContext, 'userId' | 'role'>) {
    if (items.length === 0) {
      return [];
    }

    const isOrgAdmin = this.isOrgProjectAdmin(ctx.role);
    const isSuperAdmin = ctx.role === Role.SUPER_ADMIN;
    const memberships = await this.prisma.projectMember.findMany({
      where: {
        userId: ctx.userId,
        projectId: { in: items.map((item) => item.id) },
      },
      select: {
        projectId: true,
        role: true,
        accessStart: true,
        accessEnd: true,
      },
    });
    const membershipMap = new Map(memberships.map((m) => [m.projectId, m]));

    return items.map((item) => {
      const member = membershipMap.get(item.id) ?? null;
      const access = resolveProjectListAccessMeta({
        status: item.status,
        accessStart: item.accessStart,
        accessEnd: item.accessEnd,
        isOrgAdmin,
        isSuperAdmin,
        member,
      });
      return { ...item, ...access };
    });
  }
}
