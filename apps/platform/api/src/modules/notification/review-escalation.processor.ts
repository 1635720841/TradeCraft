/**
 * 审核超时升级处理器：大纲待确认超过 24 小时通知审核岗。
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobStatus } from '@prisma/client';
import { REVIEW_ESCALATION_QUEUE } from '../../core/queue/queue.constants';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { EmailNotificationService } from './email-notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { appendNotificationLink } from './notification-link.util';

const ESCALATION_TTL_SEC = 86_400;

@Processor(REVIEW_ESCALATION_QUEUE)
export class ReviewEscalationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly inApp: InAppNotificationService,
    private readonly email: EmailNotificationService,
    private readonly recipients: NotificationRecipientService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'scan-stale-briefs') return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleJobs = await this.prisma.articleJob.findMany({
      where: {
        status: JobStatus.DRAFTING,
        briefData: { path: ['approvalStatus'], equals: 'pending' },
        updatedAt: { lte: cutoff },
      },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        targetKeyword: true,
      },
      take: 200,
    });

    const client = this.redis.getClient();
    for (const jobRow of staleJobs) {
      const dedupeKey = `notification:review_escalation:${jobRow.id}`;
      const set = await client.set(dedupeKey, '1', 'EX', ESCALATION_TTL_SEC, 'NX');
      if (set !== 'OK') continue;

      const userIds = await this.recipients.listProjectReviewNotifiableUserIds(
        jobRow.organizationId,
        jobRow.projectId,
      );
      if (userIds.length === 0) continue;

      const linkPath = `/projects/${jobRow.projectId}/seo-factory/jobs/${jobRow.id}`;
      await this.inApp.createForUsers({
        organizationId: jobRow.organizationId,
        userIds,
        type: 'brief_escalation',
        title: `大纲待确认已超时：${jobRow.targetKeyword}`,
        body: '已超过 24 小时未确认，请尽快处理',
        linkPath,
        payload: { jobId: jobRow.id },
      });

      const to = await this.recipients.listProjectReviewNotifiableEmails(
        jobRow.organizationId,
        jobRow.projectId,
      );
      await this.email.send({
        organizationId: jobRow.organizationId,
        notificationType: 'brief_escalation',
        to,
        subject: `[MW] 大纲待确认超时：${jobRow.targetKeyword}`,
        text: appendNotificationLink(
          [
            '有一篇文章的大纲待确认已超过 24 小时，请尽快处理。',
            '',
            `关键词：${jobRow.targetKeyword}`,
          ],
          linkPath,
        ),
      });
    }
  }
}
