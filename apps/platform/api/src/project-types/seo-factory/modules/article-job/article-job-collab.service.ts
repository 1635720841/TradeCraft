/**
 * 文章任务协作服务。
 */

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import {
  ARTICLE_ASSIGNED_EVENT,
  ARTICLE_COMMENT_ADDED_EVENT,
  type ArticleAssignedPayload,
  type ArticleCommentAddedPayload,
} from '../../../../core/event-bus/events';

@Injectable()
export class ArticleJobCollabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async assertJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { id: true, targetKeyword: true },
    });
    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }
    return job;
  }

  private async assertProjectMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    if (!member) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '用户不是项目成员');
    }
  }

  async listComments(organizationId: string, projectId: string, jobId: string) {
    await this.assertJob(organizationId, projectId, jobId);
    const rows = await this.prisma.articleJobComment.findMany({
      where: { organizationId, projectId, jobId },
      orderBy: { createdAt: 'asc' },
    });
    const authorIds = [...new Set(rows.map((r) => r.authorUserId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, email: true, name: true },
    });
    const authorMap = new Map(authors.map((a) => [a.id, a]));
    return rows.map((row) => ({
      ...row,
      author: authorMap.get(row.authorUserId) ?? null,
    }));
  }

  async addComment(
    organizationId: string,
    projectId: string,
    jobId: string,
    authorUserId: string,
    body: string,
  ) {
    const job = await this.assertJob(organizationId, projectId, jobId);
    const text = body?.trim();
    if (!text) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '评论内容不能为空');
    }
    const comment = await this.prisma.articleJobComment.create({
      data: {
        organizationId,
        projectId,
        jobId,
        authorUserId,
        body: text,
      },
    });

    const assignees = await this.prisma.articleJobAssignee.findMany({
      where: { jobId },
      select: { userId: true },
    });

    this.eventEmitter.emit(ARTICLE_COMMENT_ADDED_EVENT, {
      organizationId,
      projectId,
      jobId,
      targetKeyword: job.targetKeyword,
      commentId: comment.id,
      authorUserId,
      assigneeUserIds: assignees.map((a) => a.userId),
    } satisfies ArticleCommentAddedPayload);

    return comment;
  }

  async deleteComment(
    organizationId: string,
    projectId: string,
    jobId: string,
    commentId: string,
    actorUserId: string,
    isAdmin: boolean,
  ) {
    const comment = await this.prisma.articleJobComment.findFirst({
      where: { id: commentId, organizationId, projectId, jobId },
    });
    if (!comment) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '评论不存在');
    }
    if (!isAdmin && comment.authorUserId !== actorUserId) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '无权删除此评论');
    }
    await this.prisma.articleJobComment.delete({ where: { id: commentId } });
    return { ok: true };
  }

  async listAssignees(organizationId: string, projectId: string, jobId: string) {
    await this.assertJob(organizationId, projectId, jobId);
    const rows = await this.prisma.articleJobAssignee.findMany({
      where: { organizationId, projectId, jobId },
    });
    const userIds = rows.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return rows.map((row) => ({
      ...row,
      user: userMap.get(row.userId) ?? null,
    }));
  }

  async assign(
    organizationId: string,
    projectId: string,
    jobId: string,
    userId: string,
    assignedById: string,
  ) {
    const job = await this.assertJob(organizationId, projectId, jobId);
    await this.assertProjectMember(projectId, userId);

    const row = await this.prisma.articleJobAssignee.upsert({
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

    this.eventEmitter.emit(ARTICLE_ASSIGNED_EVENT, {
      organizationId,
      projectId,
      jobId,
      targetKeyword: job.targetKeyword,
      assigneeUserId: userId,
      assignedById,
    } satisfies ArticleAssignedPayload);

    return row;
  }

  async unassign(organizationId: string, projectId: string, jobId: string, userId: string) {
    await this.assertJob(organizationId, projectId, jobId);
    await this.prisma.articleJobAssignee.deleteMany({
      where: { organizationId, projectId, jobId, userId },
    });
    return { ok: true };
  }
}
