/**
 * 评分校准实验室 HTTP 入口（管理端）。
 *
 * 边界：
 * - 不负责：模型训练细节（ScoreCalibrationService）
 *
 * 入口：
 * - ScoreCalibrationController
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { CreateManualCalibrationSampleDto } from './dto/create-manual-calibration-sample.dto';
import { PredictSemrushScoreDto } from './dto/predict-semrush-score.dto';
import { QueryScoreCalibrationPairsDto } from './dto/query-score-calibration-pairs.dto';
import { UpdateManualCalibrationSampleDto } from './dto/update-manual-calibration-sample.dto';
import { SetWorkflowPairExcludedDto } from './dto/set-workflow-pair-excluded.dto';
import { QueryScoreCalibrationLabListDto } from './dto/query-score-calibration-lab-list.dto';
import { ScoreCalibrationService } from './score-calibration.service';

@Controller('api/v1/projects/:projectId/seo-score-lab')
export class ScoreCalibrationController {
  constructor(
    private readonly scoreCalibrationService: ScoreCalibrationService,
    private readonly projectService: ProjectService,
  ) {}

  @Get('readiness')
  async readiness(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.getReadiness(
      ctx.organizationId,
      projectId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('summary')
  async summary(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.getSummary(
      ctx.organizationId,
      projectId,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('pairs')
  async pairs(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query() query: QueryScoreCalibrationPairsDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.listPairs(
      ctx.organizationId,
      projectId,
      query,
    );
    return { data: data.items, meta: { traceId: ctx.traceId, pagination: data.pagination } };
  }

  @Get('export')
  async export(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.exportTrainingSet(
      ctx.organizationId,
      projectId,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('samples')
  async listSamples(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.listManualSamples(
      ctx.organizationId,
      projectId,
    );
    return { data, meta: { traceId: ctx.traceId, pagination: { total: data.length } } };
  }

  @Get('samples/:jobId')
  async getSample(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.getManualSample(
      ctx.organizationId,
      projectId,
      jobId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('samples')
  async createSample(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateManualCalibrationSampleDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.createManualSample(
      ctx.organizationId,
      projectId,
      dto,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('samples/:jobId')
  async updateSample(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateManualCalibrationSampleDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.updateManualSample(
      ctx.organizationId,
      projectId,
      jobId,
      dto,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete('samples/:jobId')
  async deleteSample(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.deleteManualSample(
      ctx.organizationId,
      projectId,
      jobId,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('pairs/:jobId/snapshots/:snapshotId/excluded')
  async setPairExcluded(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @Param('snapshotId') snapshotId: string,
    @Body() dto: SetWorkflowPairExcludedDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.setWorkflowPairExcluded(
      ctx.organizationId,
      projectId,
      jobId,
      snapshotId,
      dto.excluded,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('jobs-without-pairs')
  async jobsWithoutPairs(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query() query: QueryScoreCalibrationLabListDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.listJobsWithoutPairs(
      ctx.organizationId,
      projectId,
      query,
    );
    return { data: data.items, meta: { traceId: ctx.traceId, pagination: data.pagination } };
  }

  @Get('shadow-logs')
  async shadowLogs(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query() query: QueryScoreCalibrationLabListDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.listShadowLogs(
      ctx.organizationId,
      projectId,
      query,
    );
    return { data: data.items, meta: { traceId: ctx.traceId, pagination: data.pagination } };
  }

  @Post('predict')
  async predict(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: PredictSemrushScoreDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.scoreCalibrationService.predict(
      ctx.organizationId,
      projectId,
      dto,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
