/**
 * 关键词池 HTTP 入口。
 *
 * 边界：
 * - 不负责：优先级算法细节（KeywordPoolService）
 *
 * 入口：
 * - KeywordPoolController
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { CreateJobFromKeywordDto } from './dto/create-job-from-keyword.dto';
import { CreateJobsFromKeywordsDto } from './dto/create-jobs-from-keywords.dto';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { EnrichKeywordMetricsDto } from './dto/enrich-keyword-metrics.dto';
import { ConfirmKeywordSeedsDto } from './dto/confirm-keyword-seeds.dto';
import { GenerateKeywordSeedsDto } from './dto/generate-keyword-seeds.dto';
import { ImportKeywordsDto } from './dto/import-keywords.dto';
import { ImportGscKeywordsDto } from './dto/import-gsc-keywords.dto';
import { UpdateKeywordDto } from './dto/update-keyword.dto';
import { BatchDeleteKeywordsDto } from './dto/batch-delete-keywords.dto';
import { KeywordPoolService } from './keyword-pool.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

@Controller(seoFactoryRoutes('keywords'))
export class KeywordPoolController {
  constructor(
    private readonly keywordPoolService: KeywordPoolService,
    private readonly projectService: ProjectService,
  ) {}

  @Get('summary')
  async summary(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertSeoKeywordRead(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.getSummary(ctx.organizationId, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('intent') intent?: string,
    @Query('clusterId') clusterId?: string,
    @Query('unclustered') unclustered?: string,
    @Query('queueable') queueable?: string,
    @Query('excludeArchived') excludeArchived?: string,
    @Query('gscVerified') gscVerified?: string,
  ) {
    await this.projectService.assertSeoKeywordRead(ctx.organizationId, projectId, ctx);
    const isQueueable = queueable === '1' || queueable === 'true';
    const excludeArchivedFlag =
      excludeArchived === '0' || excludeArchived === 'false'
        ? false
        : !status && !isQueueable;
    const result = await this.keywordPoolService.findMany(ctx.organizationId, projectId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status,
      intent,
      clusterId,
      unclustered: unclustered === '1' || unclustered === 'true',
      queueable: isQueueable,
      excludeArchived: excludeArchivedFlag,
      gscVerified: gscVerified === '1' || gscVerified === 'true',
    });

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

  @Get('gsc-discovered')
  async listGscDiscovered(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
  ) {
    await this.projectService.assertSeoKeywordRead(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.listGscDiscoveredQueries(
      ctx.organizationId,
      projectId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('import-from-gsc')
  async importFromGsc(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: ImportGscKeywordsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.importFromGsc(
      ctx.organizationId,
      projectId,
      dto.items,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post()
  async create(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateKeywordDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.create(ctx.organizationId, projectId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('import')
  async importBatch(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: ImportKeywordsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.importMany(
      ctx.organizationId,
      projectId,
      dto.items,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('generate-seeds/preview')
  async previewSeeds(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateKeywordSeedsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.previewSeeds(
      ctx.organizationId,
      projectId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('generate-seeds/confirm')
  async confirmSeeds(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: ConfirmKeywordSeedsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.confirmSeeds(ctx.organizationId, projectId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('generate-seeds')
  async generateSeeds(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateKeywordSeedsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.generateSeeds(
      ctx.organizationId,
      projectId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('enrich-metrics')
  async enrichMetrics(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: EnrichKeywordMetricsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.enrichMetrics(ctx.organizationId, projectId, {
      ids: dto.ids,
      allMissing: dto.allMissing ?? !dto.ids?.length,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('create-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  async createJobs(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateJobsFromKeywordsDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.createJobsFromKeywords(
      ctx.organizationId,
      projectId,
      dto.ids,
      dto.siteId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('batch/delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: BatchDeleteKeywordsDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.batchRemove(
      ctx.organizationId,
      projectId,
      dto.ids,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id')
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateKeywordDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.update(ctx.organizationId, projectId, id, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':id')
  async remove(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.remove(ctx.organizationId, projectId, id);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/create-job')
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateJobFromKeywordDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.keywordPoolService.createJobFromKeyword(
      ctx.organizationId,
      projectId,
      id,
      dto.siteId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
