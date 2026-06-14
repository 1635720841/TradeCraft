/**
 * 站点 HTTP 入口。
 *
 * 边界：
 * - 不负责：业务校验细节（SiteService）
 *
 * 入口：
 * - SiteController
 */

import { Controller, Get, Param, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { SiteArticleCrawlerService } from './site-article-crawler.service';
import { SiteService } from './site.service';

@Controller('api/v1/projects/:projectId/sites')
export class SiteController {
  constructor(
    private readonly siteService: SiteService,
    private readonly siteArticleCrawler: SiteArticleCrawlerService,
    private readonly projectService: ProjectService,
  ) {}

  @Get()
  async list(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const sites = await this.siteService.findMany(ctx.organizationId, projectId);
    return { data: sites, meta: { traceId: ctx.traceId } };
  }

  @Get(':siteId/seo-articles')
  async listSeoArticles(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
    @Query('limit') limit?: string,
    @Query('seoArticlesOnly') seoArticlesOnly?: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const articles = await this.siteArticleCrawler.discoverForSite(
      ctx.organizationId,
      projectId,
      siteId,
      {
        limit: limit ? Number(limit) : undefined,
        seoArticlesOnly: seoArticlesOnly !== 'false',
      },
    );
    return {
      data: articles,
      meta: { traceId: ctx.traceId, total: articles.length },
    };
  }
}
