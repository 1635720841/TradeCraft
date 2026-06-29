/**
 * 出站 Webhook：配置与事件投递。
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import {
  ARTICLE_COMPLETED_EVENT,
  ARTICLE_FAILED_EVENT,
  ARTICLE_BRIEF_PENDING_EVENT,
  ARTICLE_ASSIGNED_EVENT,
  ARTICLE_COMMENT_ADDED_EVENT,
  ORG_QUOTA_LOW_EVENT,
  type ArticleCompletedPayload,
  type ArticleFailedPayload,
  type ArticleBriefPendingPayload,
  type ArticleAssignedPayload,
  type ArticleCommentAddedPayload,
  type OrgQuotaLowPayload,
} from '../../core/event-bus/events';
import { runAfterCommit } from '../../core/event-bus/run-after-commit';
import { WEBHOOK_DELIVER_QUEUE } from '../../core/queue/queue.constants';
import { PrismaService } from '../../core/database/prisma.service';
import type { WebhookDeliverJobData } from './webhook-delivery.processor';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBHOOK_DELIVER_QUEUE)
    private readonly webhookQueue: Queue<WebhookDeliverJobData>,
  ) {}

  @OnEvent(ARTICLE_COMPLETED_EVENT)
  onCompleted(payload: ArticleCompletedPayload) {
    runAfterCommit(() => this.dispatch(payload.organizationId, 'article.completed', payload));
  }

  @OnEvent(ARTICLE_FAILED_EVENT)
  onFailed(payload: ArticleFailedPayload) {
    runAfterCommit(() => this.dispatch(payload.organizationId, 'article.failed', payload));
  }

  @OnEvent(ARTICLE_BRIEF_PENDING_EVENT)
  onBriefPending(payload: ArticleBriefPendingPayload) {
    runAfterCommit(() => this.dispatch(payload.organizationId, 'article.brief_pending', payload));
  }

  @OnEvent(ARTICLE_ASSIGNED_EVENT)
  onAssigned(payload: ArticleAssignedPayload) {
    runAfterCommit(() => this.dispatch(payload.organizationId, 'article.assigned', payload));
  }

  @OnEvent(ARTICLE_COMMENT_ADDED_EVENT)
  onCommentAdded(payload: ArticleCommentAddedPayload) {
    runAfterCommit(() =>
      this.dispatch(payload.organizationId, 'article.comment_added', payload),
    );
  }

  @OnEvent(ORG_QUOTA_LOW_EVENT)
  onQuotaLow(payload: OrgQuotaLowPayload) {
    runAfterCommit(() => this.dispatch(payload.organizationId, 'org.quota_low', payload));
  }

  async dispatch(organizationId: string, event: string, payload: unknown) {
    const hooks = await this.prisma.orgWebhook.findMany({
      where: { organizationId, isActive: true, events: { has: event } },
    });

    for (const hook of hooks) {
      try {
        await this.webhookQueue.add(
          'deliver',
          {
            webhookId: hook.id,
            organizationId: hook.organizationId,
            url: hook.url,
            secret: hook.secret,
            event,
            payload,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Webhook enqueue failed: ${message}`);
      }
    }
  }
}
