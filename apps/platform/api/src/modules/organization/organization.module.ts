/**
 * 企业与成员管理模块。
 */

import { Module, forwardRef } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProjectModule } from '../project/project.module';
import { MemberInviteModule } from './member-invite.module';
import { OrgController } from './org.controller';
import { OrganizationService } from './organization.service';

@Module({
  imports: [
    AccessModule,
    forwardRef(() => AuthModule),
    BillingModule,
    MemberInviteModule,
    forwardRef(() => ProjectModule),
  ],
  controllers: [OrgController],
  providers: [OrganizationService],
  exports: [OrganizationService, MemberInviteModule],
})
export class OrganizationModule {}
