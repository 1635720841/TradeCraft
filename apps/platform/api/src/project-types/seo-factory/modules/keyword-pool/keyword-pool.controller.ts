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
import { GenerateKeywordSeedsDto } from './dto/generate-keyword-seeds.dto';
import { ImportKeywordsDto } from './dto/import-keywords.dto';
import { UpdateKeywordDto } from './dto/update-keyword.dto';
import { KeywordPoolService } from './keyword-pool.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

@Controller(seoFactoryRoutes('keywords'))
export class KeywordPoolController {
  constructor(
    private readonly keywordPoolService: KeywordPoolService,
    private readonly projectService: ProjectService,
  ) {}

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
  ) {
    await this.projectService.assertSeoKeywordRead(ctx.organizationId, projectId, ctx);
    const result = await this.keywordPoolService.findMany(ctx.organizationId, projectId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status,
      intent,
      clusterId,
      unclustered: unclustered === '1' || unclustered === 'true',
      queueable: queueable === '1' || queueable === 'true',
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
