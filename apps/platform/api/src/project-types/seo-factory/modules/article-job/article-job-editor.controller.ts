/**
 * 文章任务编辑：初稿、配图、内链、简报、审核与发布。
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';
import { ReviewArticleJobDto } from './dto/review-article-job.dto';
import { PatchArticleDraftDto, RollbackArticleDraftDto } from './dto/patch-article-draft.dto';
import { ResolveDraftStaleDto } from './dto/resolve-draft-stale.dto';
import { PatchInternalLinksDto } from './dto/patch-internal-links.dto';
import { PatchArticleImagesDto } from './dto/patch-article-images.dto';
import {
  GenerateArticleImageDto,
  RegenerateArticleImageDto,
} from './dto/regenerate-article-image.dto';
import { PatchArticleBriefDto } from './dto/patch-article-brief.dto';
import { PublishArticleJobDto } from '../export/dto/publish-article-job.dto';
import { ArticleJobDraftEditService } from './article-job-draft-edit.service';
import { ArticleJobReviewService } from './article-job-review.service';
import { ArticleJobBriefService } from './article-job-brief.service';
import { ArticleJobInternalLinksService } from './article-job-internal-links.service';
import { ArticleJobImagesService } from './article-job-images.service';
import { CmsPublishService } from '../export/cms-publish.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobEditorController {
  constructor(
    private readonly articleJobDraftEditService: ArticleJobDraftEditService,
    private readonly articleJobReviewService: ArticleJobReviewService,
    private readonly articleJobBriefService: ArticleJobBriefService,
    private readonly articleJobInternalLinksService: ArticleJobInternalLinksService,
    private readonly articleJobImagesService: ArticleJobImagesService,
    private readonly cmsPublishService: CmsPublishService,
    private readonly projectService: ProjectService,
  ) {}

  @Patch(':id/draft')
  async patchDraft(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PatchArticleDraftDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobDraftEditService.patchDraft(
      ctx,
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Get(':id/draft/history')
  async listDraftHistory(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const result = await this.articleJobDraftEditService.listEditHistory(
      ctx.organizationId,
      projectId,
      id,
    );
    return { data: result, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/draft/rollback')
  async rollbackDraft(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RollbackArticleDraftDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobDraftEditService.rollbackDraft(
      ctx,
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data: job, meta: { traceId: job.traceId } };
  }

  @Post(':id/draft/resolve-stale')
  async resolveDraftStale(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ResolveDraftStaleDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const job = await this.articleJobDraftEditService.resolveStaleAction(
      ctx,
      ctx.organizationId,
      projectId,
      id,
      dto,
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
    await this.projectService.assertSeoJobReview(ctx.organizationId, projectId, ctx);
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
    await this.projectService.assertSeoJobReview(ctx.organizationId, projectId, ctx);
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
    await this.projectService.assertSeoJobPublish(ctx.organizationId, projectId, ctx);
    const data = await this.cmsPublishService.publishJob(
      ctx.organizationId,
      projectId,
      id,
      ctx.traceId,
      dto,
      ctx.userId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id/internal-links')
  async patchInternalLinks(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PatchInternalLinksDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobInternalLinksService.patchInternalLinks(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/internal-links/reapply')
  @HttpCode(HttpStatus.ACCEPTED)
  async reapplyInternalLinks(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobInternalLinksService.reapplyInternalLinks(
      ctx.organizationId,
      projectId,
      id,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id/article-images')
  async patchArticleImages(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PatchArticleImagesDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobImagesService.patchArticleImages(
      ctx.organizationId,
      projectId,
      id,
      ctx.userId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/article-images/generate')
  async generateArticleImage(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: GenerateArticleImageDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobImagesService.generateArticleImage(
      ctx.organizationId,
      projectId,
      id,
      ctx.userId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/article-images/:index/regenerate')
  async regenerateArticleImage(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: RegenerateArticleImageDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const imageIndex = Number.parseInt(index, 10);
    const data = await this.articleJobImagesService.regenerateArticleImage(
      ctx.organizationId,
      projectId,
      id,
      ctx.userId,
      imageIndex,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/article-images/reapply')
  @HttpCode(HttpStatus.ACCEPTED)
  async reapplyArticleImages(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobImagesService.reapplyArticleImages(
      ctx.organizationId,
      projectId,
      id,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id/brief')
  async patchBrief(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: PatchArticleBriefDto,
  ) {
    await this.projectService.assertSeoJobReview(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobBriefService.patchBrief(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/brief/approve')
  @HttpCode(HttpStatus.ACCEPTED)
  async approveBrief(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobReview(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobBriefService.approveBrief(
      ctx,
      ctx.organizationId,
      projectId,
      id,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/brief/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerateBrief(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobBriefService.regenerateBrief(
      ctx.organizationId,
      projectId,
      id,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
