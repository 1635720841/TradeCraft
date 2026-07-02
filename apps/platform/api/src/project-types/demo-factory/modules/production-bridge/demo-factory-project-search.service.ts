/**
 * demo-factory 项目内搜索 Port（演示项）。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ProjectSearchGroup, ProjectSearchPort } from '@wm/platform-sdk';
import { PrismaService } from '../../../../core/database/prisma.service';
import { registerProjectSearchPort } from '../../../../core/search/project-search.registry';
import { buildProjectEnterPath } from '../../../../modules/project/project-navigation.util';

@Injectable()
export class DemoFactoryProjectSearchService implements ProjectSearchPort, OnModuleInit {
  readonly projectType = 'demo-factory';

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

    const items = await this.prisma.demoItem.findMany({
      where: {
        organizationId: ctx.organizationId,
        projectId: { in: projectIds },
        title: { contains: query, mode: 'insensitive' },
      },
      select: { id: true, projectId: true, title: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    if (items.length === 0) return [];

    return [
      {
        type: 'demo',
        label: '演示项',
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          path:
            buildProjectEnterPath(item.projectId, this.projectType) ??
            `/projects/${item.projectId}/demo-factory/overview`,
        })),
      },
    ];
  }
}
