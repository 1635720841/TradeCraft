/**
 * Webhook 模块。
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBHOOK_DELIVER_QUEUE } from '../../core/queue/queue.constants';
import { OrgWebhookController } from './webhook.controller';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookService } from './webhook.service';

@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_DELIVER_QUEUE })],
  controllers: [OrgWebhookController],
  providers: [WebhookService, WebhookDispatcherService, WebhookDeliveryProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
