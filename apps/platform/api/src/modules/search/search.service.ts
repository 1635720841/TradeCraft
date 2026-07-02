/**
 * 企业全局搜索：项目、成员、任务、站点。
 */

import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { listProjectSearchPorts } from '../../core/search/project-search.registry';
import { buildProjectEnterPath } from '../project/project-navigation.util';

export interface SearchResultGroup {
  type: 'project' | 'member' | 'job' | 'site' | 'menu' | 'demo' | string;
  label: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    path: string;
  }>;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(ctx: RequestContext, query: string, limit = 20): Promise<SearchResultGroup[]> {
    const q = query.trim();
    if (!q || q.length < 2) {
      return [];
    }

    const perType = Math.max(3, Math.floor(limit / 4));
    const groups: SearchResultGroup[] = [];

    const projects = await this.prisma.project.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: 'ACTIVE',
        name: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, name: true, projectType: true },
      take: perType,
    });

    if (projects.length > 0) {
      groups.push({
        type: 'project',
        label: '项目',
        items: projects.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.projectType,
          path: buildProjectEnterPath(p.id, p.projectType) ?? `/projects/${p.id}`,
        })),
      });
    }

    const canListMembers = ctx.permissions.includes('org:member:list');
    if (canListMembers) {
      const members = await this.prisma.user.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, email: true, name: true },
        take: perType,
      });
      if (members.length > 0) {
        groups.push({
          type: 'member',
          label: '成员',
          items: members.map((m) => ({
            id: m.id,
            title: m.name ?? m.email,
            subtitle: m.email,
            path: '/org/members',
          })),
        });
      }
    }

    const accessibleProjectIds = await this.listAccessibleProjectIds(ctx);
    if (accessibleProjectIds.length > 0) {
      const projectsByType = await this.groupAccessibleProjectsByType(
        ctx.organizationId,
        accessibleProjectIds,
      );

      for (const port of listProjectSearchPorts()) {
        const projectIds = projectsByType.get(port.projectType) ?? [];
        if (projectIds.length === 0) continue;
        const portGroups = await port.searchInProjects(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          q,
          projectIds,
          perType,
        );
        for (const group of portGroups) {
          groups.push({
            type: group.type,
            label: group.label,
            items: group.items,
          });
        }
      }
    }

    return groups;
  }

  private async groupAccessibleProjectsByType(
    organizationId: string,
    projectIds: string[],
  ): Promise<Map<string, string[]>> {
    const rows = await this.prisma.project.findMany({
      where: { organizationId, id: { in: projectIds }, status: 'ACTIVE' },
      select: { id: true, projectType: true },
    });
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.projectType) ?? [];
      list.push(row.id);
      map.set(row.projectType, list);
    }
    return map;
  }

  private async listAccessibleProjectIds(ctx: RequestContext): Promise<string[]> {
    if (ctx.role === Role.SUPER_ADMIN) {
      const rows = await this.prisma.project.findMany({
        where: { organizationId: ctx.organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    const members = await this.prisma.projectMember.findMany({
      where: { userId: ctx.userId, project: { organizationId: ctx.organizationId } },
      select: { projectId: true },
    });
    return members.map((m) => m.projectId);
  }
}
