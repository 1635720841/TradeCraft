/**
 * 根模块：组装平台层模块与项目类型插件。
 *
 * 边界：
 * - 不负责：具体业务实现
 *
 * 入口：
 * - AppModule
 */

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PromptModule } from './modules/prompt/prompt.module';
import { ProjectModule } from './modules/project/project.module';
import { SeoFactoryModule } from './project-types/seo-factory/seo-factory.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    CoreModule,
    AuthModule,
    BillingModule,
    HealthModule,
    OrganizationModule,
    PromptModule,
    ProjectModule,
    SeoFactoryModule,
  ],
})
export class AppModule {}
