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
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { EmailNotificationService } from './email-notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationRecipientService } from './notification-recipient.service';

const QUOTA_ALERT_TTL_SEC = 86_400;

@Injectable()
export class NotificationListener {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly inApp: InAppNotificationService,
    private readonly recipients: NotificationRecipientService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(ARTICLE_BRIEF_PENDING_EVENT)
  async onBriefPending(payload: ArticleBriefPendingPayload): Promise<void> {
    const userIds = await this.recipients.listProjectJobNotifiableUserIds(
      payload.organizationId,
      payload.projectId,
    );
    const linkPath = `/projects/${payload.projectId}/seo-factory/jobs/${payload.jobId}`;
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
      text: [
        '有一篇文章的大纲等待您确认后再生成正文。',
        '',
        `关键词：${payload.targetKeyword}`,
        `任务 ID：${payload.jobId}`,
        '',
        '请登录工作台，在任务列表筛选「待确认大纲」进行处理。',
      ].join('\n'),
    });
  }

  @OnEvent(ARTICLE_FAILED_EVENT)
  async onArticleFailed(payload: ArticleFailedPayload): Promise<void> {
    const userIds = await this.recipients.listProjectJobNotifiableUserIds(
      payload.organizationId,
      payload.projectId,
    );
    const linkPath = `/projects/${payload.projectId}/seo-factory/jobs/${payload.jobId}`;
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
      text: [
        '有一篇文章任务生成失败，需要您查看并处理。',
        '',
        `关键词：${payload.targetKeyword}`,
        `原因：${payload.errorMessage}`,
      ].join('\n'),
    });
  }

  @OnEvent(ORG_QUOTA_LOW_EVENT)
  async onQuotaLow(payload: OrgQuotaLowPayload): Promise<void> {
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
  }

  @OnEvent(ACCESS_REQUEST_CREATED_EVENT)
  async onAccessRequest(payload: AccessRequestCreatedPayload): Promise<void> {
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
  async onMemberInvited(_payload: MemberInvitedPayload): Promise<void> {
    // Email already sent by MemberInviteService
  }

  @OnEvent(ARTICLE_ASSIGNED_EVENT)
  async onAssigned(payload: ArticleAssignedPayload): Promise<void> {
    const linkPath = `/projects/${payload.projectId}/seo-factory/jobs/${payload.jobId}`;
    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds: [payload.assigneeUserId],
      type: 'assigned',
      title: `您被指派任务：${payload.targetKeyword}`,
      linkPath,
    });
  }

  @OnEvent(ARTICLE_COMMENT_ADDED_EVENT)
  async onComment(payload: ArticleCommentAddedPayload): Promise<void> {
    const recipients = payload.assigneeUserIds.filter((id) => id !== payload.authorUserId);
    if (recipients.length === 0) return;

    await this.inApp.createForUsers({
      organizationId: payload.organizationId,
      userIds: recipients,
      type: 'comment',
      title: `任务有新评论：${payload.targetKeyword}`,
      linkPath: `/projects/${payload.projectId}/seo-factory/jobs/${payload.jobId}`,
    });
  }

  @OnEvent(BILLING_REQUEST_CREATED_EVENT)
  async onBillingRequest(payload: BillingRequestCreatedPayload): Promise<void> {
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
