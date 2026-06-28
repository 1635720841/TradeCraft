/**
 * 通知模块：邮件与事件监听。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { EmailNotificationService } from './email-notification.service';
import { NotificationListener } from './notification.listener';
import { NotificationRecipientService } from './notification-recipient.service';

@Module({
  imports: [ProjectModule],
  providers: [EmailNotificationService, NotificationRecipientService, NotificationListener],
  exports: [EmailNotificationService],
})
export class NotificationModule {}
