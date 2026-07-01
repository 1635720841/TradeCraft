/**
 * 文章任务流水线重跑：SERP、优化、改写与 AI 重写。
 */

import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';
import { AcceptRewriteArticleJobDto, RewriteArticleJobDto } from './dto/rewrite-article-job.dto';
import { RerunArticleOptimizationDto } from './dto/rerun-article-optimization.dto';
import { RefreshArticleJobSerpDto } from './dto/refresh-article-job-serp.dto';
import { ArticleJobService } from './article-job.service';
import { ArticleJobRewriteService } from './article-job-rewrite.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobWorkflowController {
  constructor(
    private readonly articleJobService: ArticleJobService,
    private readonly articleJobRewriteService: ArticleJobRewriteService,
    private readonly projectService: ProjectService,
  ) {}

  @Post(':id/refresh-serp')
  @HttpCode(HttpStatus.OK)
  async refreshSerp(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RefreshArticleJobSerpDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.refreshSerp(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/rerun-optimization')
  @HttpCode(HttpStatus.ACCEPTED)
  async rerunOptimization(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RerunArticleOptimizationDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.rerunOptimization(
      ctx.organizationId,
      projectId,
      id,
      dto.reason ?? 'manual',
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/rerun-paraphrase')
  @HttpCode(HttpStatus.ACCEPTED)
  async rerunParaphrase(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.rerunParaphrase(ctx.organizationId, projectId, id);
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
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
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
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
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
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobRewriteService.discardRewrite(
      ctx.organizationId,
      projectId,
      id,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }
}
