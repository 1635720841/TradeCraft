/**
 * 项目访问申请：提交、审批、拒绝。
 */

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestContext } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import {
  ACCESS_REQUEST_CREATED_EVENT,
  type AccessRequestCreatedPayload,
} from '../../core/event-bus/events';
import { AuditService } from '../access/audit.service';
import { EmailNotificationService } from '../notification/email-notification.service';
import { NotificationRecipientService } from '../notification/notification-recipient.service';
import { ProjectAdminService } from '../project/project-admin.service';
import { resolvePresetPermissions } from '../project/project-permission-presets';

@Injectable()
export class AccessRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAdmin: ProjectAdminService,
    private readonly auditService: AuditService,
    private readonly email: EmailNotificationService,
    private readonly recipients: NotificationRecipientService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    organizationId: string,
    projectId: string,
    userId: string,
    message?: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!project || project.status === 'ARCHIVED') {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    const existingMember = await this.prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    if (existingMember) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '您已是项目成员');
    }

    const pending = await this.prisma.projectAccessRequest.findFirst({
      where: { organizationId, projectId, userId, status: 'PENDING' },
    });
    if (pending) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '已有待审批的申请');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { email: true },
    });

    const request = await this.prisma.projectAccessRequest.create({
      data: {
        organizationId,
        projectId,
        userId,
        message: message?.trim(),
      },
    });

    this.eventEmitter.emit(ACCESS_REQUEST_CREATED_EVENT, {
      organizationId,
      projectId,
      requestId: request.id,
      userId,
      userEmail: user?.email ?? '',
      projectName: project.name,
      message,
    } satisfies AccessRequestCreatedPayload);

    const adminEmails = await this.recipients.listOrgAdminEmails(organizationId);
    await this.email.send({
      to: adminEmails,
      subject: `[MW] 项目访问申请：${project.name}`,
      text: [
        `${user?.email ?? '某成员'} 申请加入项目「${project.name}」。`,
        message ? `留言：${message}` : '',
        '',
        '请登录企业管理 → 项目管理处理申请。',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return request;
  }

  async listPending(organizationId: string) {
    const rows = await this.prisma.projectAccessRequest.findMany({
      where: { organizationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    const [users, projects] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      }),
      this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    return rows.map((row) => ({
      ...row,
      user: userMap.get(row.userId),
      project: projectMap.get(row.projectId),
    }));
  }

  async approve(
    ctx: RequestContext,
    requestId: string,
    presetId?: string,
  ) {
    const request = await this.getPendingRequest(ctx.organizationId, requestId);

    await this.projectAdmin.addMember(ctx, request.projectId, {
      userId: request.userId,
      permissionIds: presetId ? resolvePresetPermissions(presetId) : undefined,
    });

    await this.prisma.projectAccessRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedById: ctx.userId, reviewedAt: new Date() },
    });

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.access_request.approve',
      targetType: 'ProjectAccessRequest',
      targetId: requestId,
      traceId: ctx.traceId,
    });

    return { ok: true };
  }

  async reject(ctx: RequestContext, requestId: string) {
    await this.getPendingRequest(ctx.organizationId, requestId);
    await this.prisma.projectAccessRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewedById: ctx.userId, reviewedAt: new Date() },
    });

    await this.auditService.log({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'project.access_request.reject',
      targetType: 'ProjectAccessRequest',
      targetId: requestId,
      traceId: ctx.traceId,
    });

    return { ok: true };
  }

  private async getPendingRequest(organizationId: string, requestId: string) {
    const request = await this.prisma.projectAccessRequest.findFirst({
      where: { id: requestId, organizationId, status: 'PENDING' },
    });
    if (!request) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '申请不存在或已处理');
    }
    return request;
  }
}
