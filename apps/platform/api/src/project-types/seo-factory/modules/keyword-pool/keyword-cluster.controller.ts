/**
 * 主题集群 HTTP 入口。
 *
 * 边界：
 * - 不负责：关键词 CRUD（KeywordPoolController）
 *
 * 入口：
 * - KeywordClusterController
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
} from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { AssignKeywordsToClusterDto } from './dto/assign-keywords-to-cluster.dto';
import { CreateJobsFromClusterDto } from './dto/create-jobs-from-cluster.dto';
import { CreateKeywordClusterDto } from './dto/create-keyword-cluster.dto';
import { UpdateKeywordClusterDto } from './dto/update-keyword-cluster.dto';
import { KeywordClusterService } from './keyword-cluster.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

@Controller(seoFactoryRoutes('keyword-clusters'))
export class KeywordClusterController {
  constructor(
    private readonly keywordClusterService: KeywordClusterService,
    private readonly projectService: ProjectService,
  ) {}

  @Get()
  async list(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertSeoKeywordRead(ctx.organizationId, projectId, ctx);
    const data = await this.keywordClusterService.findMany(ctx.organizationId, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post()
  async create(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateKeywordClusterDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordClusterService.create(ctx.organizationId, projectId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch(':id')
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateKeywordClusterDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordClusterService.update(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':id')
  async remove(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordClusterService.remove(ctx.organizationId, projectId, id);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/assign-keywords')
  async assignKeywords(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AssignKeywordsToClusterDto,
  ) {
    await this.projectService.assertSeoKeywordManage(ctx.organizationId, projectId, ctx);
    const data = await this.keywordClusterService.assignKeywords(
      ctx.organizationId,
      projectId,
      id,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':id/create-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  async createJobs(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateJobsFromClusterDto,
  ) {
    await this.projectService.assertSeoJobWrite(ctx.organizationId, projectId, ctx);
    const data = await this.keywordClusterService.createJobsFromCluster(
      ctx.organizationId,
      projectId,
      id,
      dto.siteId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
