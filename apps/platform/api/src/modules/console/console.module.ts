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
import { BillingModule } from '../billing/billing.module';
import { OrganizationModule } from '../organization/organization.module';
import { ConsoleController } from './console.controller';
import { ConsoleHealthController } from './console-health.controller';
import { ConsoleHealthService } from './console-health.service';
import { ConsoleService } from './console.service';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    OrganizationModule,
    BullModule.registerQueue({ name: ARTICLE_JOB_QUEUE }),
    BullModule.registerQueue({ name: PLAYWRIGHT_QUEUE }),
    BullModule.registerQueue({ name: GSC_SYNC_QUEUE }),
  ],
  controllers: [ConsoleController, ConsoleHealthController],
  providers: [ConsoleService, ConsoleHealthService],
})
export class ConsoleModule {}
