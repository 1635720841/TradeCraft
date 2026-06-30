/**
 * 评分校准实验室服务门面：聚合实验室与预测子服务。
 *
 * 边界：
 * - 不负责：具体业务逻辑（ScoreCalibrationLabService / ScoreCalibrationPredictService）
 *
 * 入口：
 * - ScoreCalibrationService
 */

import { Injectable } from '@nestjs/common';
import type { ScoreCalibrationReadiness } from '@wm/shared-core';
import type { QueryScoreCalibrationPairsDto } from './dto/query-score-calibration-pairs.dto';
import type { CreateManualCalibrationSampleDto } from './dto/create-manual-calibration-sample.dto';
import type { UpdateManualCalibrationSampleDto } from './dto/update-manual-calibration-sample.dto';
import type { PredictSemrushScoreDto } from './dto/predict-semrush-score.dto';
import type { QueryScoreCalibrationLabListDto } from './dto/query-score-calibration-lab-list.dto';
import { ScoreCalibrationLabService } from './score-calibration-lab.service';
import { ScoreCalibrationPredictService } from './score-calibration-predict.service';

@Injectable()
export class ScoreCalibrationService {
  constructor(
    private readonly labService: ScoreCalibrationLabService,
    private readonly predictService: ScoreCalibrationPredictService,
  ) {}

  getReadiness(organizationId: string, projectId: string): Promise<ScoreCalibrationReadiness> {
    return this.predictService.getReadiness(organizationId, projectId);
  }

  getSummary(organizationId: string, projectId: string, traceId: string) {
    return this.predictService.getSummary(organizationId, projectId, traceId);
  }

  listPairs(organizationId: string, projectId: string, query: QueryScoreCalibrationPairsDto) {
    return this.labService.listPairs(organizationId, projectId, query);
  }

  setWorkflowPairExcluded(
    organizationId: string,
    projectId: string,
    jobId: string,
    snapshotId: string,
    excluded: boolean,
    traceId: string,
  ) {
    return this.labService.setWorkflowPairExcluded(
      organizationId,
      projectId,
      jobId,
      snapshotId,
      excluded,
      traceId,
    );
  }

  listJobsWithoutPairs(
    organizationId: string,
    projectId: string,
    query: QueryScoreCalibrationLabListDto,
  ) {
    return this.labService.listJobsWithoutPairs(organizationId, projectId, query);
  }

  listShadowLogs(
    organizationId: string,
    projectId: string,
    query: QueryScoreCalibrationLabListDto,
  ) {
    return this.labService.listShadowLogs(organizationId, projectId, query);
  }

  exportTrainingSet(organizationId: string, projectId: string, traceId: string) {
    return this.labService.exportTrainingSet(organizationId, projectId, traceId);
  }

  listManualSamples(organizationId: string, projectId: string) {
    return this.labService.listManualSamples(organizationId, projectId);
  }

  getManualSample(organizationId: string, projectId: string, jobId: string) {
    return this.labService.getManualSample(organizationId, projectId, jobId);
  }

  updateManualSample(
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: UpdateManualCalibrationSampleDto,
    traceId: string,
  ) {
    return this.labService.updateManualSample(organizationId, projectId, jobId, dto, traceId);
  }

  deleteManualSample(
    organizationId: string,
    projectId: string,
    jobId: string,
    traceId: string,
  ) {
    return this.labService.deleteManualSample(organizationId, projectId, jobId, traceId);
  }

  createManualSample(
    organizationId: string,
    projectId: string,
    dto: CreateManualCalibrationSampleDto,
    traceId: string,
  ) {
    return this.labService.createManualSample(organizationId, projectId, dto, traceId);
  }

  predict(
    organizationId: string,
    projectId: string,
    dto: PredictSemrushScoreDto,
    traceId: string,
  ) {
    return this.predictService.predict(organizationId, projectId, dto, traceId);
  }

  loadProjectCalibration(organizationId: string, projectId: string) {
    return this.predictService.loadProjectCalibration(organizationId, projectId);
  }

  getShadowStats(organizationId: string, projectId: string) {
    return this.predictService.getShadowStats(organizationId, projectId);
  }
}
