/**
 * 文章任务协作服务。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';

@Injectable()
export class ArticleJobCollabService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { id: true },
    });
    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }
  }

  async listComments(organizationId: string, projectId: string, jobId: string) {
    await this.assertJob(organizationId, projectId, jobId);
    return this.prisma.articleJobComment.findMany({
      where: { organizationId, projectId, jobId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(
    organizationId: string,
    projectId: string,
    jobId: string,
    authorUserId: string,
    body: string,
  ) {
    await this.assertJob(organizationId, projectId, jobId);
    const text = body?.trim();
    if (!text) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '评论内容不能为空');
    }
    return this.prisma.articleJobComment.create({
      data: {
        organizationId,
        projectId,
        jobId,
        authorUserId,
        body: text,
      },
    });
  }

  async assign(
    organizationId: string,
    projectId: string,
    jobId: string,
    userId: string,
    assignedById: string,
  ) {
    await this.assertJob(organizationId, projectId, jobId);
    return this.prisma.articleJobAssignee.upsert({
      where: { jobId_userId: { jobId, userId } },
      create: {
        organizationId,
        projectId,
        jobId,
        userId,
        assignedById,
      },
      update: { assignedById },
    });
  }
}
