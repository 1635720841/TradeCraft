/**
 * 文章任务生命周期：删除、重试、暂停、继续、取消与 Semrush 检测控制。
 */

import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';
import { PauseArticleJobDto } from './dto/pause-article-job.dto';
import { ArticleJobService } from './article-job.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobLifecycleController {
  constructor(
    private readonly articleJobService: ArticleJobService,
    private readonly projectService: ProjectService,
  ) {}

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobService.remove(
      ctx.organizationId,
      projectId,
      id,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.retry(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.ACCEPTED)
  async pause(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PauseArticleJobDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.pause(
      ctx.organizationId,
      projectId,
      id,
      ctx.userId,
      dto.reason,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.ACCEPTED)
  async resume(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.resume(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  async cancel(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PauseArticleJobDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.cancel(
      ctx.organizationId,
      projectId,
      id,
      ctx.userId,
      dto.reason,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/semrush-check')
  @HttpCode(HttpStatus.ACCEPTED)
  async semrushCheck(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.triggerSemrushCheck(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/semrush-check/cancel')
  async cancelSemrushCheck(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobService.cancelSemrushCheck(ctx.organizationId, projectId, id);
    return { data: job, meta: { traceId: job.traceId } };
  }
}
