/**
 * 企业项目管理：访问期、成员与项目内权限。
 */

import { Injectable } from '@nestjs/common';
import { ProjectMemberRole, Role as PrismaRole } from '@prisma/client';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import {
  isPlatformStaffOrgRole,
  tenantVisibleProjectMemberUserFilter,
} from '../access/tenant-member-visibility';
import { AuditService } from '../access/audit.service';
import { isWithinAccessWindow, listGrantablePermissionsForProjectType } from './project-access.constants';
import { ProjectAccessService } from './project-access.service';
import { ProjectService } from './project.service';
import type { AddProjectMemberDto } from './dto/add-project-member.dto';
import type { UpdateProjectAccessDto } from './dto/update-project-access.dto';
import type { UpdateProjectMemberDto } from './dto/update-project-member.dto';

@Injectable()
export class ProjectAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
  ) {}

  async removeProject(ctx: RequestContext, projectId: string) {
    await this.assertProjectManageable(ctx, projectId);
    return this.projectService.remove(ctx.organizationId, projectId, {
      userId: ctx.userId,
      traceId: ctx.traceId,
    });
  }

  async listManagedProjects(ctx: RequestContext, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const where = { organizationId: ctx.organizationId };

    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          projectType: true,
          status: true,
          accessStart: true,
          accessEnd: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    const items = await this.projectAccessService.enrichProjectListItems(rows, ctx);
    const memberCountMap =
      ctx.role === Role.SUPER_ADMIN
        ? null
        : await this.countTenantVisibleMembersByProject(
            rows.map((row) => row.id),
            ctx.role,
          );

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        projectType: item.projectType,
        status: item.status,
        accessStart: item.accessStart,
        accessEnd: item.accessEnd,
        memberCount: memberCountMap?.get(item.id) ?? item._count.members,
        accessActive: item.accessActive,
        isMember: item.isMember,
        memberAccessActive: item.memberAccessActive,
        myAccessStatus: item.myAccessStatus,
        canEnter: item.canEnter,
        canManage: item.canManage,
        createdAt: item.createdAt,
      })),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async getManagedProject(ctx: RequestContext, projectId: string) {
    const project = await this.assertProjectInOrg(ctx.organizationId, projectId);

    const [access] = await this.projectAccessService.enrichProjectListItems(
      [
        {
          id: project.id,
          status: project.status,
          accessStart: project.accessStart,
          accessEnd: project.accessEnd,
        },
      ],
      ctx,
    );

    const base = {
      id: project.id,
      name: project.name,
      projectType: project.projectType,
      status: project.status,
      accessStart: project.accessStart,
      accessEnd: project.accessEnd,
      accessActive: access.accessActive,
      isMember: access.isMember,
      memberAccessActive: access.memberAccessActive,
      myAccessStatus: access.myAccessStatus,
      canEnter: access.canEnter,
      canManage: access.canManage,
      effectivePermissions: await this.resolveViewerProjectPermissions(ctx, project),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      members: [] as Array<{
        id: string;
        userId: string;
        email: string;
        name: string | null;
        orgRole: string;
        role: string;
        accessStart: Date | null;
        accessEnd: Date | null;
        accessActive: boolean;
      }>,
    };

    if (!access.canManage) {
      return base;
    }

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        role: true,
        accessStart: true,
        accessEnd: true,
        user: { select: { email: true, name: true, role: true } },
      },
    });

    base.members = this.filterProjectMembersForViewer(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        orgRole: m.user.role,
        role: m.role,
        accessStart: m.accessStart,
        accessEnd: m.accessEnd,
        accessActive: isWithinAccessWindow(m.accessStart, m.accessEnd),
      })),
      ctx.role,
    );

    return base;
  }

  async updateProjectAccess(
    ctx: RequestContext,
    projectId: string,
    dto: UpdateProjectAccessDto,
  ) {
    await this.assertProjectManageable(ctx, projectId);

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.accessStart !== undefined
          ? { accessStart: dto.accessStart ? new Date(dto.accessStart) : null }
          : {}),
        ...(dto.accessEnd !== undefined
          ? { accessEnd: dto.accessEnd ? new Date(dto.accessEnd) : null }
          : {}),
      },
      select: {
        id: true,
        name: true,
        projectType: true,
        status: true,
        accessStart: true,
        accessEnd: true,
      },
    });

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.update',
      targetType: 'Project',
      targetId: project.id,
      metadata: { fields: Object.keys(dto) },
      traceId: ctx.traceId,
    });

    return project;
  }

  async listMembers(ctx: RequestContext, projectId: string) {
    const project = await this.assertProjectInOrg(ctx.organizationId, projectId);
    await this.assertCanViewProject(ctx, project.id);
    const detail = await this.getManagedProject(ctx, projectId);
    return detail.members;
  }

  async addMember(ctx: RequestContext, projectId: string, dto: AddProjectMemberDto) {
    await this.assertProjectManageable(ctx, projectId);
    const project = await this.assertProjectInOrg(ctx.organizationId, projectId);

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: ctx.organizationId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      throw new BusinessException(ErrorCodes.MEMBER_NOT_FOUND, '成员不存在');
    }
    if (
      ctx.role !== Role.SUPER_ADMIN &&
      (user.role === PrismaRole.SUPER_ADMIN || user.role === PrismaRole.PLATFORM_OPERATOR)
    ) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '不能将平台账号加入项目');
    }

    const member = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      create: {
        projectId,
        userId: dto.userId,
        role: dto.role ?? ProjectMemberRole.VIEWER,
        accessStart: dto.accessStart ? new Date(dto.accessStart) : null,
        accessEnd: dto.accessEnd ? new Date(dto.accessEnd) : null,
        grantedById: ctx.userId,
      },
      update: {
        role: dto.role ?? ProjectMemberRole.VIEWER,
        accessStart: dto.accessStart ? new Date(dto.accessStart) : null,
        accessEnd: dto.accessEnd ? new Date(dto.accessEnd) : null,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        accessStart: true,
        accessEnd: true,
        user: { select: { email: true, name: true, role: true } },
      },
    });

    if (dto.permissionIds?.length) {
      await this.projectAccessService.setMemberPermissions(
        member.id,
        project.projectType,
        dto.permissionIds,
      );
    }

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.member.add',
      targetType: 'ProjectMember',
      targetId: member.id,
      metadata: {
        projectId,
        userId: member.userId,
        email: member.user.email,
        role: member.role,
      },
      traceId: ctx.traceId,
    });

    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      orgRole: member.user.role,
      role: member.role,
      accessStart: member.accessStart,
      accessEnd: member.accessEnd,
    };
  }

  async updateMember(
    ctx: RequestContext,
    projectId: string,
    userId: string,
    dto: UpdateProjectMemberDto,
  ) {
    await this.assertProjectManageable(ctx, projectId);
    const project = await this.assertProjectInOrg(ctx.organizationId, projectId);

    const member = await this.assertTenantVisibleProjectMember(ctx, projectId, userId);

    const updated = await this.prisma.projectMember.update({
      where: { id: member.id },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.accessStart !== undefined
          ? { accessStart: dto.accessStart ? new Date(dto.accessStart) : null }
          : {}),
        ...(dto.accessEnd !== undefined
          ? { accessEnd: dto.accessEnd ? new Date(dto.accessEnd) : null }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        role: true,
        accessStart: true,
        accessEnd: true,
        user: { select: { email: true, name: true, role: true } },
      },
    });

    if (dto.permissionIds) {
      await this.projectAccessService.setMemberPermissions(
        updated.id,
        project.projectType,
        dto.permissionIds,
      );
    }

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.member.update',
      targetType: 'ProjectMember',
      targetId: updated.id,
      metadata: {
        projectId,
        userId: updated.userId,
        email: updated.user.email,
        fields: Object.keys(dto),
      },
      traceId: ctx.traceId,
    });

    return {
      id: updated.id,
      userId: updated.userId,
      email: updated.user.email,
      name: updated.user.name,
      orgRole: updated.user.role,
      role: updated.role,
      accessStart: updated.accessStart,
      accessEnd: updated.accessEnd,
    };
  }

  async removeMember(ctx: RequestContext, projectId: string, userId: string) {
    await this.assertProjectManageable(ctx, projectId);

    const member = await this.assertTenantVisibleProjectMember(ctx, projectId, userId);

    await this.prisma.projectMember.delete({ where: { id: member.id } });

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.member.remove',
      targetType: 'ProjectMember',
      targetId: member.id,
      metadata: { projectId, userId },
      traceId: ctx.traceId,
    });

    return { userId };
  }

  async getMemberPermissions(ctx: RequestContext, projectId: string, userId: string) {
    const project = await this.assertProjectInOrg(ctx.organizationId, projectId);
    await this.assertCanViewProject(ctx, project.id);
    await this.assertTenantVisibleProjectMember(ctx, projectId, userId);
    return this.projectAccessService.getMemberAccessSummary(
      projectId,
      userId,
      project.projectType,
    );
  }

  async setMemberPermissions(
    ctx: RequestContext,
    projectId: string,
    userId: string,
    permissionIds: string[],
  ) {
    await this.assertProjectManageable(ctx, projectId);
    const project = await this.assertProjectInOrg(ctx.organizationId, projectId);
    const member = await this.assertTenantVisibleProjectMember(ctx, projectId, userId);

    await this.projectAccessService.setMemberPermissions(
      member.id,
      project.projectType,
      permissionIds,
    );

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.member.grant',
      targetType: 'ProjectMember',
      targetId: member.id,
      metadata: { projectId, userId, permissionIds },
      traceId: ctx.traceId,
    });

    return this.projectAccessService.getMemberAccessSummary(
      projectId,
      userId,
      project.projectType,
    );
  }

  private filterProjectMembersForViewer<
    T extends { orgRole: string },
  >(members: T[], viewerRole: Role): T[] {
    if (viewerRole === Role.SUPER_ADMIN) {
      return members;
    }
    return members.filter((member) => !isPlatformStaffOrgRole(member.orgRole));
  }

  private async countTenantVisibleMembersByProject(
    projectIds: string[],
    viewerRole: Role,
  ) {
    if (projectIds.length === 0) {
      return new Map<string, number>();
    }

    const rows = await this.prisma.projectMember.groupBy({
      by: ['projectId'],
      where: {
        projectId: { in: projectIds },
        ...tenantVisibleProjectMemberUserFilter(viewerRole),
      },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.projectId, row._count._all]));
  }

  private async assertTenantVisibleProjectMember(
    ctx: RequestContext,
    projectId: string,
    userId: string,
  ) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { user: { select: { role: true } } },
    });

    if (!member) {
      throw new BusinessException(ErrorCodes.PROJECT_MEMBER_NOT_FOUND, '项目成员不存在');
    }

    if (ctx.role !== Role.SUPER_ADMIN && isPlatformStaffOrgRole(member.user.role)) {
      throw new BusinessException(ErrorCodes.PROJECT_MEMBER_NOT_FOUND, '项目成员不存在');
    }

    return member;
  }

  private async resolveViewerProjectPermissions(
    ctx: RequestContext,
    project: { id: string; projectType: string },
  ): Promise<string[]> {
    if (ctx.role === Role.SUPER_ADMIN) {
      return listGrantablePermissionsForProjectType(project.projectType);
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: ctx.userId } },
      select: { id: true, role: true },
    });
    if (!member) {
      return [];
    }
    return this.projectAccessService.resolveMemberPermissions(
      member.id,
      member.role,
      project.projectType,
    );
  }

  private async assertProjectInOrg(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }
    return project;
  }

  private async assertProjectManageable(ctx: RequestContext, projectId: string) {
    if (this.projectAccessService.isOrgProjectAdmin(ctx.role)) {
      return;
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.userId } },
      select: { role: true },
    });
    if (!member || member.role !== ProjectMemberRole.OWNER) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '无权管理该项目');
    }
  }

  private async assertCanViewProject(ctx: RequestContext, projectId: string) {
    if (this.projectAccessService.isOrgProjectAdmin(ctx.role)) {
      return;
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.userId } },
    });
    if (!member) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '无权查看该项目成员配置');
    }
  }
}
