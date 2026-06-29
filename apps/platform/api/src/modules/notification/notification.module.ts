/**
 * 通知模块：邮件、站内信、机器人通道与事件监听。
 */

import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { REVIEW_ESCALATION_QUEUE } from '../../core/queue/queue.constants';
import { ProjectModule } from '../project/project.module';
import { EmailNotificationService } from './email-notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationListener } from './notification.listener';
import { NotificationRecipientService } from './notification-recipient.service';
import { OrgNotificationController, OrgNotificationPreferenceController } from './org-notification.controller';
import { OrgRobotChannelController } from './org-robot-channel.controller';
import { OrgRobotChannelService } from './org-robot-channel.service';
import { ReviewEscalationProcessor } from './review-escalation.processor';
import { ReviewEscalationScheduler } from './review-escalation.scheduler';
import { RobotNotificationService } from './robot-notification.service';
import { UserNotificationPreferenceService } from './user-notification-preference.service';

@Module({
  imports: [
    forwardRef(() => ProjectModule),
    BullModule.registerQueue({ name: REVIEW_ESCALATION_QUEUE }),
  ],
  controllers: [OrgNotificationController, OrgNotificationPreferenceController, OrgRobotChannelController],
  providers: [
    EmailNotificationService,
    InAppNotificationService,
    NotificationRecipientService,
    NotificationListener,
    RobotNotificationService,
    OrgRobotChannelService,
    UserNotificationPreferenceService,
    ReviewEscalationProcessor,
    ReviewEscalationScheduler,
  ],
  exports: [
    EmailNotificationService,
    InAppNotificationService,
    NotificationRecipientService,
    UserNotificationPreferenceService,
  ],
})
export class NotificationModule {}
