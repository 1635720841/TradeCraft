/**
 * 根模块：组装平台层模块与项目类型插件。
 */

import { Module, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CoreModule } from './core/core.module';
import { AccessModule } from './modules/access/access.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { ConsoleModule } from './modules/console/console.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PromptModule } from './modules/prompt/prompt.module';
import { ProjectModule } from './modules/project/project.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SearchModule } from './modules/search/search.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { getRegisteredProjectTypes } from './modules/project/project-type.registry';

const projectTypeModules = getRegisteredProjectTypes().map(
  (plugin) => plugin.register() as Type,
);

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    CoreModule,
    AccessModule,
    AuthModule,
    BillingModule,
    ConsoleModule,
    HealthModule,
    OrganizationModule,
    PromptModule,
    ProjectModule,
    NotificationModule,
    SearchModule,
    WebhookModule,
    ...projectTypeModules,
  ],
})
export class AppModule {}
