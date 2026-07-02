/**
 * 平台运营控制台模块。
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  ARTICLE_JOB_QUEUE,
  GSC_SYNC_QUEUE,
  PLAYWRIGHT_QUEUE,
} from '../../core/queue/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { AccessModule } from '../access/access.module';
import { BillingModule } from '../billing/billing.module';
import { OrganizationModule } from '../organization/organization.module';
import { ConsoleBridgeHostModule } from '../../core/console/console-bridge-host.module';
import { ConsoleController } from './console.controller';
import { ConsoleGscController } from './console-gsc.controller';
import { ConsoleHealthController } from './console-health.controller';
import { ConsoleHealthService } from './console-health.service';
import { ConsoleAccessService } from './console-access.service';
import { ConsoleService } from './console.service';
import { ConsoleTenantService } from './console-tenant.service';
import { ConsoleSiteService } from './console-site.service';

@Module({
  imports: [
    ConsoleBridgeHostModule,
    AuthModule,
    AccessModule,
    BillingModule,
    OrganizationModule,
    BullModule.registerQueue({ name: ARTICLE_JOB_QUEUE }),
    BullModule.registerQueue({ name: PLAYWRIGHT_QUEUE }),
    BullModule.registerQueue({ name: GSC_SYNC_QUEUE }),
  ],
  controllers: [ConsoleController, ConsoleGscController, ConsoleHealthController],
  providers: [
    ConsoleService,
    ConsoleTenantService,
    ConsoleSiteService,
    ConsoleAccessService,
    ConsoleHealthService,
  ],
})
export class ConsoleModule {}
