/**
 * Webhook 模块。
 */

import { Module } from '@nestjs/common';
import { OrgWebhookController } from './webhook.controller';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookService } from './webhook.service';

@Module({
  controllers: [OrgWebhookController],
  providers: [WebhookService, WebhookDispatcherService],
  exports: [WebhookService],
})
export class WebhookModule {}
