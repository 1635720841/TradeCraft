/**
 * seo-factory 项目内搜索 Port（文章任务、站点）。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ProjectSearchGroup, ProjectSearchPort } from '@wm/platform-sdk';
import { PrismaService } from '../../../../core/database/prisma.service';
import { registerProjectSearchPort } from '../../../../core/search/project-search.registry';
import { buildProjectResourcePath } from '../../../../modules/project/project-navigation.util';

@Injectable()
export class SeoFactoryProjectSearchService implements ProjectSearchPort, OnModuleInit {
  readonly projectType = 'seo-factory';

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    registerProjectSearchPort(this);
  }

  async searchInProjects(
    ctx: { organizationId: string },
    query: string,
    projectIds: string[],
    limit: number,
  ): Promise<ProjectSearchGroup[]> {
    if (projectIds.length === 0) return [];

    const [jobs, sites] = await Promise.all([
      this.prisma.articleJob.findMany({
        where: {
          organizationId: ctx.organizationId,
          projectId: { in: projectIds },
          OR: [
            { targetKeyword: { contains: query, mode: 'insensitive' } },
            { id: query.length >= 8 ? query : undefined },
          ],
        },
        select: { id: true, projectId: true, targetKeyword: true },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.site.findMany({
        where: {
          organizationId: ctx.organizationId,
          projectId: { in: projectIds },
          domain: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, projectId: true, domain: true },
        take: limit,
      }),
    ]);

    const groups: ProjectSearchGroup[] = [];
    if (jobs.length > 0) {
      groups.push({
        type: 'job',
        label: '文章任务',
        items: jobs.map((job) => ({
          id: job.id,
          title: job.targetKeyword,
          subtitle: job.id.slice(0, 8),
          path:
            buildProjectResourcePath(job.projectId, this.projectType, 'jobs', job.id) ??
            `/projects/${job.projectId}/seo-factory/jobs/${job.id}`,
        })),
      });
    }
    if (sites.length > 0) {
      groups.push({
        type: 'site',
        label: '站点',
        items: sites.map((site) => ({
          id: site.id,
          title: site.domain,
          path:
            buildProjectResourcePath(site.projectId, this.projectType, 'sites') ??
            `/projects/${site.projectId}/seo-factory/sites`,
        })),
      });
    }
    return groups;
  }
}
