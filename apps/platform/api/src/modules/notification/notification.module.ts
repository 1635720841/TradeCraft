/**
 * 通知模块：邮件、站内信与事件监听。
 */

import { Module, forwardRef } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { EmailNotificationService } from './email-notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationListener } from './notification.listener';
import { NotificationRecipientService } from './notification-recipient.service';
import { OrgNotificationController } from './org-notification.controller';

@Module({
  imports: [forwardRef(() => ProjectModule)],
  controllers: [OrgNotificationController],
  providers: [
    EmailNotificationService,
    InAppNotificationService,
    NotificationRecipientService,
    NotificationListener,
  ],
  exports: [
    EmailNotificationService,
    InAppNotificationService,
    NotificationRecipientService,
  ],
})
export class NotificationModule {}
