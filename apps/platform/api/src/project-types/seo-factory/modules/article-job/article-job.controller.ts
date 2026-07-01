/**
 * 文章任务核心：创建、列表、详情与统计。
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

import { parsePageLimit } from '../../../../core/utils/parse-page-limit.util';
import { CreateArticleJobDto } from './dto/create-article-job.dto';
import { ListArticleJobsQueryDto } from './dto/list-article-jobs.dto';
import { ArticleJobService } from './article-job.service';
import { ArticleJobStatsService } from './article-job-stats.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobController {
  constructor(
    private readonly articleJobService: ArticleJobService,
    private readonly articleJobStatsService: ArticleJobStatsService,
    private readonly projectService: ProjectService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateArticleJobDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.create(ctx.organizationId, projectId, dto);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Get('stats/summary')
  async stats(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query('siteId') siteId?: string,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobStatsService.getProjectStats(
      ctx.organizationId,
      projectId,
      siteId?.trim() || undefined,
      ctx.userId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query() query: ListArticleJobsQueryDto,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const { page: safePage, limit: safeLimit } = parsePageLimit(query.page, query.limit);
    const result = await this.articleJobService.findMany(
      ctx.organizationId,
      projectId,
      safePage,
      safeLimit,
      {
        briefPending: query.briefPending === true,
        generating: query.generating === true,
        cmsPublishFailed: query.cmsPublishFailed === true,
        cmsPublishPending: query.cmsPublishPending === true,
        staleDraft: query.staleDraft === true,
        seoNotReady: query.seoNotReady === true,
        needsAction: query.needsAction === true,
        reviewPending: query.reviewPending === true,
        assignedToMe: query.assignedToMe === true,
        siteOwnerMe: query.siteOwner === 'me',
        actorUserId: ctx.userId,
        status: query.status === 'FAILED' ? 'FAILED' : undefined,
        siteId: query.siteId?.trim() || undefined,
        keyword: query.keyword?.trim() || undefined,
      },
    );
    const traceId = result.items[0]?.traceId ?? ctx.traceId;
    return {
      data: result.items,
      meta: {
        traceId,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
        },
      },
    };
  }

  @Get(':id')
  async getOne(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.findOne(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }
}
