/**
 * 企业与成员管理模块。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { LegacyOrganizationController, OrgController } from './org.controller';
import { OrganizationService } from './organization.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [OrgController, LegacyOrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
