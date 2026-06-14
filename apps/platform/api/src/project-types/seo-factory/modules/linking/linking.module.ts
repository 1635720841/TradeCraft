/**
 * 内链模块（M8）。
 *
 * 边界：
 * - 不负责：工作流状态机（WorkflowService）
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { SiteModule } from '../site/site.module';
import { LinkingService } from './linking.service';
import { SitePageController } from './site-page.controller';
import { SitePageService } from './site-page.service';

@Module({
  imports: [ProjectModule, SiteModule],
  controllers: [SitePageController],
  providers: [LinkingService, SitePageService],
  exports: [LinkingService, SitePageService],
})
export class LinkingModule {}
