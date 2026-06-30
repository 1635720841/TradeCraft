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
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { Public } from '../../../../core/decorators/public.decorator';
import { UnauthorizedException } from '../../../../core/exceptions/auth.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { ProjectService } from '../../../../modules/project/project.service';
import { AcceptRewriteArticleJobDto, RewriteArticleJobDto } from './dto/rewrite-article-job.dto';
import { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import { CreateArticleJobDto } from './dto/create-article-job.dto';
import { ReviewArticleJobDto } from './dto/review-article-job.dto';
import { ArticleJobRewriteService } from './article-job-rewrite.service';
import { ArticleJobDraftEditService } from './article-job-draft-edit.service';
import { ArticleJobDraftImageService } from './article-job-draft-image.service';
import { verifyDraftImageSignedQuery } from './draft-image.util';
import { DRAFT_IMAGE_MAX_BYTES } from '../../constants/draft-image';
import { ArticleJobReviewService } from './article-job-review.service';
import { PatchArticleDraftDto, RollbackArticleDraftDto } from './dto/patch-article-draft.dto';
import { ResolveDraftStaleDto } from './dto/resolve-draft-stale.dto';
import { ArticleJobBriefService } from './article-job-brief.service';
import { ArticleJobInternalLinksService } from './article-job-internal-links.service';
import { PatchInternalLinksDto } from './dto/patch-internal-links.dto';
import { ArticleJobService } from './article-job.service';
import { ArticleJobStatsService } from './article-job-stats.service';
import { CmsPublishService } from '../export/cms-publish.service';
import { PublishArticleJobDto } from '../export/dto/publish-article-job.dto';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';
import {
  BatchDeleteArticleJobsDto,
  BatchPublishArticleJobsDto,
  BatchRetryArticleJobsDto,
} from './dto/batch-article-jobs-actions.dto';
import { PatchArticleBriefDto } from './dto/patch-article-brief.dto';
import { RerunArticleOptimizationDto } from './dto/rerun-article-optimization.dto';
import { RefreshArticleJobSerpDto } from './dto/refresh-article-job-serp.dto';
import { BatchExportArticleJobsDto } from './dto/batch-export-article-jobs.dto';
import { ExportService } from '../export/export.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobController {
  constructor(
    private readonly articleJobService: ArticleJobService,
    private readonly articleJobStatsService: ArticleJobStatsService,
    private readonly articleJobRewriteService: ArticleJobRewriteService,
    private readonly articleJobDraftEditService: ArticleJobDraftEditService,
    private readonly articleJobDraftImageService: ArticleJobDraftImageService,
    private readonly articleJobReviewService: ArticleJobReviewService,
    private readonly articleJobBriefService: ArticleJobBriefService,
    private readonly articleJobInternalLinksService: ArticleJobInternalLinksService,
    private readonly cmsPublishService: CmsPublishService,
    private readonly exportService: ExportService,
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

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async createBatch(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateBatchArticleJobsDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const result = await this.articleJobService.createBatch(ctx.organizationId, projectId, dto);
    const traceId = result.jobs[0]?.traceId ?? `tr_batch_${projectId}`;
    return { data: result, meta: { traceId } };
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

  @Post('batch/retry')
  @HttpCode(HttpStatus.OK)
  async batchRetry(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: BatchRetryArticleJobsDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobService.batchRetry(
      ctx.organizationId,
      projectId,
      dto.jobIds,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('batch/delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: BatchDeleteArticleJobsDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobService.batchRemove(
      ctx.organizationId,
      projectId,
      dto.jobIds,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('batch/brief-approve')
  @HttpCode(HttpStatus.OK)
  async batchApproveBrief(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: BatchRetryArticleJobsDto,
  ) {
    await this.projectService.assertSeoJobReview(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobBriefService.batchApproveBrief(
      ctx,
      ctx.organizationId,
      projectId,
      dto.jobIds,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('batch/publish')
  @HttpCode(HttpStatus.OK)
  async batchPublish(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: BatchPublishArticleJobsDto,
  ) {
    await this.projectService.assertSeoJobPublish(ctx.organizationId, projectId, ctx);
    const data = await this.cmsPublishService.batchPublish(
      ctx.organizationId,
      projectId,
      ctx.traceId,
      dto,
      ctx.userId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('batch/export')
  @Header('Cache-Control', 'private, no-store')
  async batchExport(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: BatchExportArticleJobsDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const pack = await this.exportService.buildBatchExportPackage(
      ctx.organizationId,
      projectId,
      dto.jobIds,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(pack.fileName)}`,
    );
    res.setHeader('X-Export-Exported', String(pack.exported));
    res.setHeader('X-Export-Failed', String(pack.failed));
    res.setHeader(
      'X-Export-Failures',
      encodeURIComponent(JSON.stringify(pack.failures)),
    );
    res.send(pack.buffer);
  }

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('briefPending') briefPending?: string,
    @Query('generating') generating?: string,
    @Query('cmsPublishFailed') cmsPublishFailed?: string,
    @Query('cmsPublishPending') cmsPublishPending?: string,
    @Query('staleDraft') staleDraft?: string,
    @Query('seoNotReady') seoNotReady?: string,
    @Query('reviewPending') reviewPending?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('siteOwner') siteOwner?: string,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('keyword') keyword?: string,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const result = await this.articleJobService.findMany(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      {
        briefPending: briefPending === '1' || briefPending === 'true',
        generating: generating === '1' || generating === 'true',
        cmsPublishFailed: cmsPublishFailed === '1' || cmsPublishFailed === 'true',
        cmsPublishPending: cmsPublishPending === '1' || cmsPublishPending === 'true',
        staleDraft: staleDraft === '1' || staleDraft === 'true',
        seoNotReady: seoNotReady === '1' || seoNotReady === 'true',
        reviewPending: reviewPending === '1' || reviewPending === 'true',
        assignedToMe: assignedToMe === '1' || assignedToMe === 'true',
        siteOwnerMe: siteOwner === 'me',
        actorUserId: ctx.userId,
        status: status === 'FAILED' ? 'FAILED' : undefined,
        siteId: siteId?.trim() || undefined,
        keyword: keyword?.trim() || undefined,
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

  @Post(':id/draft/images')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: DRAFT_IMAGE_MAX_BYTES },
    }),
  )
  async uploadDraftImage(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.articleJobDraftImageService.uploadDraftImage(
      ctx.organizationId,
      projectId,
      id,
      file,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Public()
  @Get(':id/draft/images/:filename')
  @Header('Cache-Control', 'private, max-age=3600')
  async getDraftImage(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('filename') filename: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!verifyDraftImageSignedQuery(projectId, id, filename, exp, sig)) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '图片链接无效或已过期');
    }

    const job = await this.articleJobService.findOneForImageAccess(projectId, id);
    const file = await this.articleJobDraftImageService.getDraftImage(
      job.organizationId,
      projectId,
      id,
      filename,
    );
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
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
