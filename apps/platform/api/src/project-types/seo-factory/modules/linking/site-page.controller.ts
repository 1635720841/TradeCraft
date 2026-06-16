/**

 * 站点页面库 HTTP 入口（内链候选页）。

 *

 * 边界：

 * - 不负责：内链植入（LinkingService）

 *

 * 入口：

 * - SitePageController

 */



import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Body } from '@nestjs/common';

import type { RequestContext } from '@wm/shared-core';

import { ReqCtx } from '../../../../core/decorators/request-context.decorator';

import { ProjectService } from '../../../../modules/project/project.service';

import { SitePageService } from './site-page.service';
import { PatchSitePageDto } from './dto/patch-site-page.dto';



@Controller('api/v1/projects/:projectId/sites/:siteId/pages')

export class SitePageController {

  constructor(

    private readonly sitePageService: SitePageService,

    private readonly projectService: ProjectService,

  ) {}



  @Get()

  async list(

    @ReqCtx() ctx: RequestContext,

    @Param('projectId') projectId: string,

    @Param('siteId') siteId: string,

  ) {

    await this.projectService.assertAccessible(ctx.organizationId, projectId);

    const pages = await this.sitePageService.listForSite(ctx.organizationId, projectId, siteId);

    return { data: pages, meta: { traceId: ctx.traceId, total: pages.length } };

  }



  @Post('sync')

  @HttpCode(HttpStatus.OK)

  async sync(

    @ReqCtx() ctx: RequestContext,

    @Param('projectId') projectId: string,

    @Param('siteId') siteId: string,

  ) {

    await this.projectService.assertAccessible(ctx.organizationId, projectId);

    const result = await this.sitePageService.syncFromSitemap(

      ctx.organizationId,

      projectId,

      siteId,

    );

    return { data: result, meta: { traceId: ctx.traceId } };

  }

  @Patch(':pageId')
  async patch(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body() dto: PatchSitePageDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const page = await this.sitePageService.patchPage(
      ctx.organizationId,
      projectId,
      siteId,
      pageId,
      dto.primaryKeyword,
    );
    return { data: page, meta: { traceId: ctx.traceId } };
  }

}


