/**
 * 文章任务协作：评论与指派。
 */

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';
import { ArticleJobCollabService } from './article-job-collab.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobCollabController {
  constructor(
    private readonly collabService: ArticleJobCollabService,
    private readonly projectService: ProjectService,
  ) {}

  @Get(':jobId/comments')
  async listComments(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const data = await this.collabService.listComments(
      ctx.organizationId,
      projectId,
      jobId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':jobId/comments')
  async addComment(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @Body() body: { body: string },
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.collabService.addComment(
      ctx.organizationId,
      projectId,
      jobId,
      ctx.userId,
      body.body,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':jobId/assignees')
  async assign(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @Body() body: { userId: string },
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.collabService.assign(
      ctx.organizationId,
      projectId,
      jobId,
      body.userId,
      ctx.userId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
