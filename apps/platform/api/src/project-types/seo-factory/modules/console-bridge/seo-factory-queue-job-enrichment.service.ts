/**
 * SEO 工厂：为 Console 队列任务明细提供文章任务富化数据。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  registerQueueJobEnrichment,
  type QueueJobArticleEnrichment,
  type QueueJobEnrichmentPort,
} from '../../../../core/console/queue-job-enrichment.port';
import { PrismaService } from '../../../../core/database/prisma.service';

@Injectable()
export class SeoFactoryQueueJobEnrichmentService implements QueueJobEnrichmentPort, OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    registerQueueJobEnrichment(this);
  }

  async enrichArticleJobs(jobIds: string[]): Promise<Map<string, QueueJobArticleEnrichment>> {
    if (jobIds.length === 0) return new Map();

    const rows = await this.prisma.articleJob.findMany({
      where: { id: { in: jobIds } },
      select: {
        id: true,
        targetKeyword: true,
        status: true,
        organizationId: true,
        projectId: true,
        seoCheckData: true,
      },
    });

    const map = new Map<string, QueueJobArticleEnrichment>();
    for (const row of rows) {
      const seoCheckData = (row.seoCheckData ?? {}) as {
        workflowProgress?: { phase?: string };
      };
      map.set(row.id, {
        id: row.id,
        targetKeyword: row.targetKeyword,
        status: row.status,
        organizationId: row.organizationId,
        projectId: row.projectId,
        workflowPhase: seoCheckData.workflowProgress?.phase ?? null,
      });
    }
    return map;
  }
}
