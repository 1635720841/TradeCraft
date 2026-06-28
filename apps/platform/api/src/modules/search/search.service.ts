/**
 * 企业全局搜索：项目、成员、任务、站点。
 */

import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';

export interface SearchResultGroup {
  type: 'project' | 'member' | 'job' | 'site' | 'menu';
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
          path: `/projects/${p.id}/${p.projectType}/overview`,
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
      const [jobs, sites] = await Promise.all([
        this.prisma.articleJob.findMany({
          where: {
            organizationId: ctx.organizationId,
            projectId: { in: accessibleProjectIds },
            OR: [
              { targetKeyword: { contains: q, mode: 'insensitive' } },
              { id: q.length >= 8 ? q : undefined },
            ],
          },
          select: { id: true, projectId: true, targetKeyword: true },
          take: perType,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.site.findMany({
          where: {
            organizationId: ctx.organizationId,
            projectId: { in: accessibleProjectIds },
            domain: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, projectId: true, domain: true },
          take: perType,
        }),
      ]);

      if (jobs.length > 0) {
        groups.push({
          type: 'job',
          label: '文章任务',
          items: jobs.map((j) => ({
            id: j.id,
            title: j.targetKeyword,
            subtitle: j.id.slice(0, 8),
            path: `/projects/${j.projectId}/seo-factory/jobs/${j.id}`,
          })),
        });
      }

      if (sites.length > 0) {
        groups.push({
          type: 'site',
          label: '站点',
          items: sites.map((s) => ({
            id: s.id,
            title: s.domain,
            path: `/projects/${s.projectId}/seo-factory/sites`,
          })),
        });
      }
    }

    return groups;
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
