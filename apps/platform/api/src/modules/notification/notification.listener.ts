/**
 * 事件驱动通知：大纲待确认、任务失败、配额偏低。
 */

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ARTICLE_BRIEF_PENDING_EVENT,
  ARTICLE_FAILED_EVENT,
  ORG_QUOTA_LOW_EVENT,
  type ArticleBriefPendingPayload,
  type ArticleFailedPayload,
  type OrgQuotaLowPayload,
} from '../../core/event-bus/events';
import { RedisService } from '../../core/redis/redis.service';
import { EmailNotificationService } from './email-notification.service';
import { NotificationRecipientService } from './notification-recipient.service';

const QUOTA_ALERT_TTL_SEC = 86_400;

@Injectable()
export class NotificationListener {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly recipients: NotificationRecipientService,
    private readonly redis: RedisService,
  ) {}

  @OnEvent(ARTICLE_BRIEF_PENDING_EVENT)
  async onBriefPending(payload: ArticleBriefPendingPayload): Promise<void> {
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
        `Trace：${payload.traceId}`,
        '',
        '请登录工作台，在任务列表筛选「待确认大纲」进行处理。',
      ].join('\n'),
    });
  }

  @OnEvent(ARTICLE_FAILED_EVENT)
  async onArticleFailed(payload: ArticleFailedPayload): Promise<void> {
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
        `任务 ID：${payload.jobId}`,
        `原因：${payload.errorMessage}`,
        `Trace：${payload.traceId}`,
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

    const to = await this.recipients.listOrgAdminEmails(payload.organizationId);
    await this.email.send({
      to,
      subject: `[MW] 内容配额即将用尽（剩余 ${payload.remaining} 篇）`,
      text: [
        '您企业的本月内容配额已偏低，请及时联系平台续期或加购。',
        '',
        `剩余：${payload.remaining} / ${payload.monthlyQuota} 篇（约 ${payload.percentRemaining}%）`,
      ].join('\n'),
    });
  }
}
