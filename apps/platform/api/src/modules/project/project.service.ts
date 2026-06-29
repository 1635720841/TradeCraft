/**
 * 项目服务：CRUD 与 org 隔离查询。
 */

import { Injectable } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { tenantVisibleProjectMemberUserFilter } from '../access/tenant-member-visibility';
import { AuditService } from '../access/audit.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { ProjectAccessService } from './project-access.service';
import { listProjectTypeDescriptors } from './project-type.descriptors';
import type { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly auditService: AuditService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async list(
    organizationId: string,
    page = 1,
    limit = 20,
    actor?: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId },
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
        },
      }),
      this.prisma.project.count({ where: { organizationId } }),
    ]);

    const items = actor
      ? await this.projectAccessService.enrichProjectListItems(rows, actor)
      : rows;

    const memberCountMap = await this.countProjectMembersByProject(
      rows.map((row) => row.id),
      actor?.role,
    );

    return {
      items: items.map((item) => ({
        ...item,
        memberCount: memberCountMap.get(item.id) ?? 0,
      })),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  private async countProjectMembersByProject(
    projectIds: string[],
    viewerRole?: RequestContext['role'],
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

  listProjectTypes() {
    return listProjectTypeDescriptors();
  }

  async create(
    organizationId: string,
    dto: CreateProjectDto,
    creatorUserId: string,
    traceId?: string,
  ) {
    await this.entitlementsService.assertProjectLimit(organizationId);

    const project = await this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        projectType: dto.projectType,
        accessStart: dto.accessStart ? new Date(dto.accessStart) : null,
        accessEnd: dto.accessEnd ? new Date(dto.accessEnd) : null,
      },
      select: {
        id: true,
        name: true,
        projectType: true,
        status: true,
        accessStart: true,
        accessEnd: true,
        createdAt: true,
      },
    });

    await this.projectAccessService.ensureOwnerOnCreate(project.id, creatorUserId);

    await this.auditService.log({
      organizationId,
      actorUserId: creatorUserId,
      action: 'project.create',
      targetType: 'Project',
      targetId: project.id,
      metadata: { name: project.name, projectType: project.projectType },
      traceId,
    });

    return project;
  }

  async findOne(
    organizationId: string,
    projectId: string,
    actor?: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        name: true,
        projectType: true,
        status: true,
        config: true,
        accessStart: true,
        accessEnd: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    if (actor) {
      await this.projectAccessService.assertUserCanUseProject(actor, project);
      const [enriched] = await this.projectAccessService.enrichProjectListItems(
        [project],
        actor,
      );
      return enriched;
    }

    return project;
  }

  async archive(organizationId: string, projectId: string, actor: RequestContext) {
    await this.assertAccessible(organizationId, projectId, actor);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.ARCHIVED },
      select: { id: true, name: true, projectType: true, status: true },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: 'project.archive',
      targetType: 'Project',
      targetId: project.id,
      metadata: { name: project.name },
      traceId: actor.traceId,
    });

    return project;
  }

  /** 永久删除项目及其 SEO 工厂业务数据（不可恢复） */
  async remove(
    organizationId: string,
    projectId: string,
    actor?: { userId: string; traceId?: string },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true },
    });

    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.articleJob.deleteMany({ where: { projectId } });
      await tx.keywordEntry.deleteMany({ where: { projectId } });
      await tx.keywordCluster.deleteMany({ where: { projectId } });
      await tx.site.deleteMany({ where: { projectId } });
      await tx.project.delete({ where: { id: projectId } });
    });

    if (actor) {
      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: 'project.delete',
        targetType: 'Project',
        targetId: projectId,
        metadata: { name: project.name },
        traceId: actor.traceId,
      });
    }

    return { id: projectId, name: project.name };
  }

  async assertAccessible(
    organizationId: string,
    projectId: string,
    actor?: Pick<RequestContext, 'userId' | 'role'>,
    options?: { anyOf?: readonly string[]; expectedProjectType?: string },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        status: true,
        projectType: true,
        accessStart: true,
        accessEnd: true,
      },
    });

    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    if (
      options?.expectedProjectType &&
      project.projectType !== options.expectedProjectType
    ) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BusinessException(ErrorCodes.PROJECT_ARCHIVED, '项目已归档，无法操作');
    }

    if (actor) {
      await this.projectAccessService.assertUserCanUseProject(actor, project);
      if (options?.anyOf?.length) {
        await this.projectAccessService.assertMemberHasAnyPermission(
          actor,
          project,
          options.anyOf,
        );
      }
    }

    return project;
  }

  assertSeoJobRead(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:job:read'],
    });
  }

  assertSeoJobWrite(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:job:create'],
    });
  }

  /** 大纲确认、敏感审核等（审核岗或站点管理员） */
  assertSeoJobReview(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:job:review', 'seo:site:manage'],
    });
  }

  /** CMS 发布（执行岗或站点管理员） */
  assertSeoJobPublish(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:job:create', 'seo:site:manage'],
    });
  }

  assertSeoKeywordRead(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:job:read', 'seo:keyword:manage'],
    });
  }

  assertSeoKeywordManage(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:keyword:manage'],
    });
  }

  assertSeoSiteRead(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:job:read', 'seo:site:manage'],
    });
  }

  assertSeoSiteManage(
    organizationId: string,
    projectId: string,
    actor: Pick<RequestContext, 'userId' | 'role'>,
  ) {
    return this.assertAccessible(organizationId, projectId, actor, {
      expectedProjectType: 'seo-factory',
      anyOf: ['seo:site:manage'],
    });
  }
}
