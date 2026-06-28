/**
 * 站点 HTTP 入口。
 *
 * 边界：
 * - 不负责：业务校验细节（SiteService）
 *
 * 入口：
 * - SiteController
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { ListShopifyBlogsDto } from './dto/list-shopify-blogs.dto';
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
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const sites = await this.siteService.findMany(ctx.organizationId, projectId);
    return { data: sites, meta: { traceId: ctx.traceId } };
  }

  @Post()
  async create(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSiteDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const site = await this.siteService.create(ctx.organizationId, projectId, dto);
    return { data: site, meta: { traceId: ctx.traceId } };
  }

  @Post('shopify/blogs')
  async listShopifyBlogs(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: ListShopifyBlogsDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const data = await this.siteService.listShopifyBlogs(
      ctx.organizationId,
      projectId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('shopify/products')
  async listShopifyProducts(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: ListShopifyBlogsDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const data = await this.siteService.listShopifyProducts(
      ctx.organizationId,
      projectId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get(':siteId/keyword-conflicts')
  async keywordConflicts(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
    @Query('keyword') keyword?: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const conflicts = await this.siteService.findKeywordConflicts(
      ctx.organizationId,
      projectId,
      siteId,
      keyword ?? '',
    );
    return { data: { conflicts }, meta: { traceId: ctx.traceId } };
  }

  @Get(':siteId')
  async getOne(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const site = await this.siteService.findOne(ctx.organizationId, projectId, siteId);
    return { data: site, meta: { traceId: ctx.traceId } };
  }

  @Patch(':siteId')
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
    @Body() dto: UpdateSiteDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const site = await this.siteService.update(ctx.organizationId, projectId, siteId, dto);
    return { data: site, meta: { traceId: ctx.traceId } };
  }

  @Post(':siteId/serp-cache/clear')
  async clearSerpCache(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
    const result = await this.siteService.clearSerpCache(
      ctx.organizationId,
      projectId,
      siteId,
    );
    return { data: result, meta: { traceId: ctx.traceId } };
  }

  @Get(':siteId/seo-articles')
  async listSeoArticles(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
    @Query('limit') limit?: string,
    @Query('seoArticlesOnly') seoArticlesOnly?: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId, ctx);
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
