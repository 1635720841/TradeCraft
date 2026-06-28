/**
 * 平台运营控制台模块。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { OrganizationModule } from '../organization/organization.module';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';

@Module({
  imports: [AuthModule, BillingModule, OrganizationModule],
  controllers: [ConsoleController],
  providers: [ConsoleService],
})
export class ConsoleModule {}
