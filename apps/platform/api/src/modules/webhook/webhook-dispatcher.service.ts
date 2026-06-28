/**
 * 出站 Webhook：配置与事件投递。
 */

import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ARTICLE_COMPLETED_EVENT,
  ARTICLE_FAILED_EVENT,
  ORG_QUOTA_LOW_EVENT,
  type ArticleCompletedPayload,
  type ArticleFailedPayload,
  type OrgQuotaLowPayload,
} from '../../core/event-bus/events';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(ARTICLE_COMPLETED_EVENT)
  async onCompleted(payload: ArticleCompletedPayload) {
    await this.dispatch(payload.organizationId, 'article.completed', payload);
  }

  @OnEvent(ARTICLE_FAILED_EVENT)
  async onFailed(payload: ArticleFailedPayload) {
    await this.dispatch(payload.organizationId, 'article.failed', payload);
  }

  @OnEvent(ORG_QUOTA_LOW_EVENT)
  async onQuotaLow(payload: OrgQuotaLowPayload) {
    await this.dispatch(payload.organizationId, 'org.quota_low', payload);
  }

  async dispatch(organizationId: string, event: string, payload: unknown) {
    const hooks = await this.prisma.orgWebhook.findMany({
      where: { organizationId, isActive: true, events: { has: event } },
    });

    for (const hook of hooks) {
      await this.deliver(hook, event, payload);
    }
  }

  private async deliver(
    hook: { id: string; organizationId: string; url: string; secret: string },
    event: string,
    payload: unknown,
  ) {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex');

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-MW-Signature': signature,
            'X-MW-Event': event,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        await this.prisma.webhookDeliveryLog.create({
          data: {
            organizationId: hook.organizationId,
            webhookId: hook.id,
            event,
            statusCode: res.status,
            success: res.ok,
            errorMessage: res.ok ? null : await res.text().catch(() => 'HTTP error'),
          },
        });

        if (res.ok) return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.webhookDeliveryLog.create({
          data: {
            organizationId: hook.organizationId,
            webhookId: hook.id,
            event,
            success: false,
            errorMessage: message.slice(0, 500),
          },
        });
        this.logger.warn(`Webhook delivery failed (${attempt + 1}/3): ${message}`);
      }

      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
