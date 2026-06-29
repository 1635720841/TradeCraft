/**
 * 文章任务活动流：审核、发布、协作等关键操作留痕。
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';

export interface ArticleJobActivityRecordInput {
  organizationId: string;
  projectId: string;
  jobId: string;
  type: string;
  actorUserId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ArticleJobActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: ArticleJobActivityRecordInput): Promise<void> {
    await this.prisma.articleJobActivity.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        jobId: input.jobId,
        type: input.type,
        actorUserId: input.actorUserId,
        summary: input.summary,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(organizationId: string, projectId: string, jobId: string, limit = 50) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const rows = await this.prisma.articleJobActivity.findMany({
      where: { organizationId, projectId, jobId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    const actorIds = [...new Set(rows.map((row) => row.actorUserId))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, name: true },
    });
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    return rows.map((row) => ({
      ...row,
      actor: actorMap.get(row.actorUserId) ?? null,
    }));
  }
}
