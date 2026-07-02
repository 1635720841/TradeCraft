import { Module, forwardRef } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationModule } from '../notification/notification.module';
import { OrgProjectController } from './org-project.controller';
import { ProjectTypesController } from './project-types.controller';
import { AccessRequestService } from './access-request.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectAdminService } from './project-admin.service';
import { ProjectService } from './project.service';

@Module({
  imports: [AccessModule, BillingModule, forwardRef(() => NotificationModule)],
  controllers: [OrgProjectController, ProjectTypesController],
  providers: [
    ProjectService,
    ProjectAccessService,
    ProjectAdminService,
    AccessRequestService,
  ],
  exports: [ProjectService, ProjectAccessService, ProjectAdminService, AccessRequestService],
})
export class ProjectModule {}
