/**
 * 事件驱动通知：邮件 + 站内信。
 */

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ACCESS_REQUEST_CREATED_EVENT,
  ARTICLE_ASSIGNED_EVENT,
  ARTICLE_BRIEF_PENDING_EVENT,
  ARTICLE_COMMENT_ADDED_EVENT,
  ARTICLE_FAILED_EVENT,
  BILLING_REQUEST_CREATED_EVENT,
  MEMBER_INVITED_EVENT,
  ORG_QUOTA_LOW_EVENT,
  type AccessRequestCreatedPayload,
  type ArticleAssignedPayload,
  type ArticleBriefPendingPayload,
  type ArticleCommentAddedPayload,
  type ArticleFailedPayload,
  type BillingRequestCreatedPayload,
  type MemberInvitedPayload,
  type OrgQuotaLowPayload,
} from '../../core/event-bus/events';
import { runAfterCommit } from '../../core/event-bus/run-after-commit';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { EmailNotificationService } from './email-notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { buildProjectResourcePath } from '../project/project-navigation.util';
import { RobotNotificationService } from './robot-notification.service';
import { appendNotificationLink } from './notification-link.util';

const DEFAULT_PROJECT_TYPE = 'seo-factory';

function jobLinkPath(projectId: string, jobId: string, projectType = DEFAULT_PROJECT_TYPE) {
  return (
    buildProjectResourcePath(projectId, projectType, 'jobs', jobId) ??
    `/projects/${projectId}/seo-factory/jobs/${jobId}`
  );
}

const QUOTA_ALERT_TTL_SEC = 86_400;

@Injectable()
export class NotificationListener {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly inApp: InAppNotificationService,
    private readonly recipients: NotificationRecipientService,
    private readonly robots: RobotNotificationService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(ARTICLE_BRIEF_PENDING_EVENT)
  onBriefPending(payload: ArticleBriefPendingPayload): void {
    runAfterCommit(() => this.handleBriefPending(payload));
  }

  private async handleBriefPending(payload: ArticleBriefPendingPayload): Promise<void> {
    const userIds = await this.recipients.listProjectJobNotifiableUserIds(
      payload.organizationId,
      payload.projectId,
    );
    const linkPath = jobLinkPath(payload.projectId, payload.jobId);
    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds,
      type: 'brief_pending',
      title: `大纲待确认：${payload.targetKeyword}`,
      body: '请确认大纲后再生成正文',
      linkPath,
      payload: { jobId: payload.jobId },
    });

    const to = await this.recipients.listProjectJobNotifiableEmails(
      payload.organizationId,
      payload.projectId,
    );
    await this.email.send({
      to,
      subject: `[MW] 大纲待确认：${payload.targetKeyword}`,
      text: appendNotificationLink(
        [
          '有一篇文章的大纲等待您确认后再生成正文。',
          '',
          `关键词：${payload.targetKeyword}`,
        ],
        linkPath,
      ),
    });

    await this.robots.notify({
      organizationId: payload.organizationId,
      eventType: 'brief_pending',
      title: `大纲待确认：${payload.targetKeyword}`,
      body: '请确认大纲后再生成正文',
      linkPath,
    });
  }

  @OnEvent(ARTICLE_FAILED_EVENT)
  onArticleFailed(payload: ArticleFailedPayload): void {
    runAfterCommit(() => this.handleArticleFailed(payload));
  }

  private async handleArticleFailed(payload: ArticleFailedPayload): Promise<void> {
    const userIds = await this.recipients.listProjectJobNotifiableUserIds(
      payload.organizationId,
      payload.projectId,
    );
    const linkPath = jobLinkPath(payload.projectId, payload.jobId);
    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds,
      type: 'job_failed',
      title: `任务失败：${payload.targetKeyword}`,
      body: payload.errorMessage,
      linkPath,
    });

    const to = await this.recipients.listProjectJobNotifiableEmails(
      payload.organizationId,
      payload.projectId,
    );
    await this.email.send({
      to,
      subject: `[MW] 文章任务失败：${payload.targetKeyword}`,
      text: appendNotificationLink(
        [
          '有一篇文章任务生成失败，需要您查看并处理。',
          '',
          `关键词：${payload.targetKeyword}`,
          `原因：${payload.errorMessage}`,
        ],
        linkPath,
      ),
    });

    await this.robots.notify({
      organizationId: payload.organizationId,
      eventType: 'job_failed',
      title: `任务失败：${payload.targetKeyword}`,
      body: payload.errorMessage,
      linkPath,
    });
  }

  @OnEvent(ORG_QUOTA_LOW_EVENT)
  onQuotaLow(payload: OrgQuotaLowPayload): void {
    runAfterCommit(() => this.handleQuotaLow(payload));
  }

  private async handleQuotaLow(payload: OrgQuotaLowPayload): Promise<void> {
    const dedupeKey = `notification:quota_low:${payload.organizationId}`;
    const client = this.redis.getClient();
    const set = await client.set(dedupeKey, '1', 'EX', QUOTA_ALERT_TTL_SEC, 'NX');
    if (set !== 'OK') {
      return;
    }

    const adminIds = await this.recipients.listOrgAdminUserIds(payload.organizationId);
    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds: adminIds,
      type: 'quota_low',
      title: `配额即将用尽（剩余 ${payload.remaining} 篇）`,
      linkPath: '/org/billing',
    });

    const to = await this.recipients.listOrgAdminEmails(payload.organizationId);
    await this.email.send({
      to,
      subject: `[MW] 内容配额即将用尽（剩余 ${payload.remaining} 篇）`,
      text: [
        '您企业的本月内容配额已偏低，请及时申请续期或加购。',
        '',
        `剩余：${payload.remaining} / ${payload.monthlyQuota} 篇`,
      ].join('\n'),
    });

    await this.robots.notify({
      organizationId: payload.organizationId,
      eventType: 'quota_low',
      title: `配额即将用尽（剩余 ${payload.remaining} 篇）`,
      body: `剩余 ${payload.remaining} / ${payload.monthlyQuota} 篇`,
      linkPath: '/org/billing',
    });
  }

  @OnEvent(ACCESS_REQUEST_CREATED_EVENT)
  onAccessRequest(payload: AccessRequestCreatedPayload): void {
    runAfterCommit(() => this.handleAccessRequest(payload));
  }

  private async handleAccessRequest(payload: AccessRequestCreatedPayload): Promise<void> {
    const adminIds = await this.recipients.listOrgAdminUserIds(payload.organizationId);
    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds: adminIds,
      type: 'access_request',
      title: `项目访问申请：${payload.projectName}`,
      body: payload.message ?? payload.userEmail,
      linkPath: '/org/projects',
    });
  }

  @OnEvent(MEMBER_INVITED_EVENT)
  onMemberInvited(_payload: MemberInvitedPayload): void {
    // Email already sent by MemberInviteService
  }

  @OnEvent(ARTICLE_ASSIGNED_EVENT)
  onAssigned(payload: ArticleAssignedPayload): void {
    runAfterCommit(() => this.handleAssigned(payload));
  }

  private async handleAssigned(payload: ArticleAssignedPayload): Promise<void> {
    const linkPath = jobLinkPath(payload.projectId, payload.jobId);
    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds: [payload.assigneeUserId],
      type: 'assigned',
      title: `您被指派任务：${payload.targetKeyword}`,
      body: '请登录工作台查看并处理',
      linkPath,
    });

    const assignee = await this.prisma.user.findFirst({
      where: { id: payload.assigneeUserId },
      select: { email: true, status: true },
    });
    if (assignee?.email && assignee.status === 'ACTIVE') {
      await this.email.send({
        to: [assignee.email],
        subject: `[MW] 您被指派任务：${payload.targetKeyword}`,
        text: appendNotificationLink(
          [
            '您被指派了一篇内容任务，请及时处理。',
            '',
            `关键词：${payload.targetKeyword}`,
          ],
          linkPath,
        ),
      });
    }

    await this.robots.notify({
      organizationId: payload.organizationId,
      eventType: 'assigned',
      title: `您被指派任务：${payload.targetKeyword}`,
      linkPath,
    });
  }

  @OnEvent(ARTICLE_COMMENT_ADDED_EVENT)
  onComment(payload: ArticleCommentAddedPayload): void {
    runAfterCommit(() => this.handleComment(payload));
  }

  private async handleComment(payload: ArticleCommentAddedPayload): Promise<void> {
    const linkPath = jobLinkPath(payload.projectId, payload.jobId);
    const recipientSet = new Set([
      ...payload.assigneeUserIds,
      ...(payload.mentionedUserIds ?? []),
    ]);
    const recipients = [...recipientSet].filter((id) => id !== payload.authorUserId);
    if (recipients.length === 0) return;

    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds: recipients,
      type: 'comment',
      title: `任务有新评论：${payload.targetKeyword}`,
      linkPath,
    });

    const mentionedOnly = (payload.mentionedUserIds ?? []).filter(
      (id) => id !== payload.authorUserId && !payload.assigneeUserIds.includes(id),
    );
    if (mentionedOnly.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: mentionedOnly }, status: 'ACTIVE' },
      select: { id: true, email: true },
    });
    const emails = users.map((user) => user.email).filter(Boolean) as string[];
    if (emails.length === 0) return;

    await this.email.send({
      to: emails,
      subject: `[MW] 您在评论中被提及：${payload.targetKeyword}`,
      text: appendNotificationLink(
        ['有人在任务评论中 @ 了您，请及时查看。', '', `关键词：${payload.targetKeyword}`],
        linkPath,
      ),
    });
  }

  @OnEvent(BILLING_REQUEST_CREATED_EVENT)
  onBillingRequest(payload: BillingRequestCreatedPayload): void {
    runAfterCommit(() => this.handleBillingRequest(payload));
  }

  private async handleBillingRequest(payload: BillingRequestCreatedPayload): Promise<void> {
    const ops = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'PLATFORM_OPERATOR'] } },
      select: { id: true, organizationId: true },
    });
    for (const op of ops) {
      await this.inApp.createForUsers({
        organizationId: op.organizationId,
        userIds: [op.id],
        type: 'billing_request',
        title: '有新的计费变更申请',
        linkPath: '/console/overview',
        payload: { requestId: payload.requestId },
      });
    }
  }
}
