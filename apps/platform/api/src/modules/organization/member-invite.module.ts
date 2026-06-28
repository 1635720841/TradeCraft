/**
 * 成员邀请模块。
 */

import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { NotificationModule } from '../notification/notification.module';
import { MemberInviteService } from './member-invite.service';

@Module({
  imports: [AccessModule, NotificationModule],
  providers: [MemberInviteService],
  exports: [MemberInviteService],
})
export class MemberInviteModule {}
