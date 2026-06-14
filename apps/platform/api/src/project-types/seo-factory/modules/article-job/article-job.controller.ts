/**
 * 文章任务 HTTP 入口。
 *
 * 边界：
 * - 不负责：业务逻辑、工作流调度
 *
 * 入口：
 * - ArticleJobController
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { AcceptRewriteArticleJobDto, RewriteArticleJobDto } from './dto/rewrite-article-job.dto';
import { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import { CreateArticleJobDto } from './dto/create-article-job.dto';
import { ReviewArticleJobDto } from './dto/review-article-job.dto';
import { ArticleJobRewriteService } from './article-job-rewrite.service';
import { ArticleJobReviewService } from './article-job-review.service';
import { ArticleJobService } from './article-job.service';
import { CmsPublishService } from '../export/cms-publish.service';
import { PublishArticleJobDto } from '../export/dto/publish-article-job.dto';

@Controller('api/v1/projects/:projectId/article-jobs')
export class ArticleJobController {
  constructor(
    private readonly articleJobService: ArticleJobService,
    private readonly articleJobRewriteService: ArticleJobRewriteService,
    private readonly articleJobReviewService: ArticleJobReviewService,
    private readonly cmsPublishService: CmsPublishService,
    private readonly projectService: ProjectService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateArticleJobDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobService.create(ctx.organizationId, projectId, dto);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async createBatch(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateBatchArticleJobsDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const result = await this.articleJobService.createBatch(ctx.organizationId, projectId, dto);
    const traceId = result.jobs[0]?.traceId ?? `tr_batch_${projectId}`;
    return { data: result, meta: { traceId } };
  }

  @Get('stats/summary')
  async stats(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.articleJobService.getProjectStats(ctx.organizationId, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('reviews/pending')
  async listPendingReviews(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const result = await this.articleJobReviewService.listPending(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
        },
      },
    };
  }

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const result = await this.articleJobService.findMany(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
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
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobService.findOne(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobService.retry(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/semrush-check')
  @HttpCode(HttpStatus.ACCEPTED)
  async semrushCheck(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobService.triggerSemrushCheck(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/semrush-check/cancel')
  async cancelSemrushCheck(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobService.cancelSemrushCheck(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/rewrite')
  @HttpCode(HttpStatus.ACCEPTED)
  async rewrite(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RewriteArticleJobDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobRewriteService.triggerRewrite(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/rewrite/accept')
  async acceptRewrite(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AcceptRewriteArticleJobDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobRewriteService.acceptRewrite(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/rewrite/discard')
  async discardRewrite(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobRewriteService.discardRewrite(
      ctx.organizationId,
      projectId,
      id,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/review/approve')
  async approveReview(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ReviewArticleJobDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobReviewService.approve(
      ctx,
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/review/reject')
  async rejectReview(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ReviewArticleJobDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const job = await this.articleJobReviewService.reject(
      ctx,
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PublishArticleJobDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.cmsPublishService.publishJob(
      ctx.organizationId,
      projectId,
      id,
      ctx.traceId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
