/**
 * 文章任务批量操作。
 */

import { Body, Controller, Header, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';
import { CreateBatchArticleJobsDto } from './dto/create-batch-article-jobs.dto';
import {
  BatchDeleteArticleJobsDto,
  BatchPublishArticleJobsDto,
  BatchRetryArticleJobsDto,
} from './dto/batch-article-jobs-actions.dto';
import { BatchExportArticleJobsDto } from './dto/batch-export-article-jobs.dto';
import { ArticleJobService } from './article-job.service';
import { ArticleJobBriefService } from './article-job-brief.service';
import { CmsPublishService } from '../export/cms-publish.service';
import { ExportService } from '../export/export.service';

@Controller(seoFactoryRoutes('article-jobs'))
export class ArticleJobBatchController {
  constructor(
    private readonly articleJobService: ArticleJobService,
    private readonly articleJobBriefService: ArticleJobBriefService,
    private readonly cmsPublishService: CmsPublishService,
    private readonly exportService: ExportService,
    private readonly projectService: ProjectService,
  ) {}

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
}
