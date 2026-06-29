/**
 * Webhook 投递 BullMQ 处理器：带重试与投递日志。
 */

import { createHmac } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WEBHOOK_DELIVER_QUEUE } from '../../core/queue/queue.constants';
import { PrismaService } from '../../core/database/prisma.service';
import { LoggerService } from '../../core/logger/logger.service';

export interface WebhookDeliverJobData {
  webhookId: string;
  organizationId: string;
  url: string;
  secret: string;
  event: string;
  payload: unknown;
}

@Processor(WEBHOOK_DELIVER_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<WebhookDeliverJobData>): Promise<void> {
    const { webhookId, organizationId, url, secret, event, payload } = job.data;
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    try {
      const res = await fetch(url, {
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
          organizationId,
          webhookId,
          event,
          statusCode: res.status,
          success: res.ok,
          errorMessage: res.ok ? null : (await res.text().catch(() => 'HTTP error')).slice(0, 500),
        },
      });

      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.webhookDeliveryLog.create({
        data: {
          organizationId,
          webhookId,
          event,
          success: false,
          errorMessage: message.slice(0, 500),
        },
      });
      this.logger.warn('Webhook delivery failed', {
        action: 'webhook.deliver.failed',
        webhookId,
        event,
        error: message,
      });
      throw err;
    }
  }
}
