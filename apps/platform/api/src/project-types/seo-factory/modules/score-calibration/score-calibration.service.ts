/**
 * 评分校准实验室服务：聚合快照、训练校准模型、导出训练集。
 *
 * 边界：
 * - 不负责：Semrush RPA 终检（ISeoCheckerProvider）
 * - 不负责：改写正文（LlmService）
 *
 * 入口：
 * - ScoreCalibrationService
 */

import { Injectable } from '@nestjs/common';
import type { SeoScore } from '@wm/provider-interfaces';
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT,
  SCORE_CALIBRATION_MIN_SAMPLES,
  attributeScoreCalibrationDrivers,
  buildCalibrationExportRow,
  computeScoreCalibrationFeatureMeans,
  listScoreCalibrationModelWeights,
  predictCalibratedSemrushScore,
  resolveHoldoutJobIds,
  resolveScoreCalibrationReadiness,
  trainScoreCalibrationModel,
  buildCalibrationLabelWarning,
  detectCalibrationPairOutliers,
  SCORE_CALIBRATION_TRIAL_HOLDOUT_MIN,
  SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN,
  SCORE_CALIBRATION_TRIAL_HOLDOUT_MAE,
  SCORE_CALIBRATION_TRIAL_PASS_MIN,
  SCORE_CALIBRATION_PRODUCTION_PASS_MIN,
  SCORE_CALIBRATION_TRIAL_PASS_RECALL,
  SCORE_CALIBRATION_PRODUCTION_PASS_RECALL,
  type ScoreCalibrationFeatures,
  type ScoreCalibrationReadiness,
  type ScoreCalibrationModel,
} from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { SEMRUSH_PASS_THRESHOLD } from '../../constants/seo-score';
import {
  buildErrorBucketStats,
  buildCalibrationCoverage,
  computePairStats,
  extractExcludedScoreCalibrationPairs,
  extractScoreCalibrationPairs,
  toCalibrationTrainingRows,
  type ScoreCalibrationPairRecord,
} from '../../utils/score-calibration-pairs.util';
import { findMissingSemrushKeywords } from '../../providers/semrush/semrush-keyword-coverage.util';
import { scoreArticleContent } from '../../utils/article-content-score.util';
import {
  buildCalibrationLabJobId,
  CALIBRATION_LAB_IMPORT_FLAG,
  CALIBRATION_LAB_JOB_ID_PREFIX,
  clearManualCalibrationSamplesConfig,
  isCalibrationLabImportSeoCheckData,
  MAX_MANUAL_CALIBRATION_SAMPLES,
  readManualCalibrationSamples,
} from '../../utils/score-calibration-manual-samples.util';
import { buildSemrushAnalysisSnapshot, type SeoAnalysisSnapshot } from '../../utils/seo-analysis-snapshot.util';
import {
  normalizeArticleScoreContent,
  resolveArticleScoreKeywordList,
  scoreLocalSeo,
} from '@wm/shared-core';
import { aggregateCalibrationShadowStats } from '../../utils/score-calibration-runtime.util';
import {
  findCalibrationSnapshotById,
  isWorkflowCalibrationPairSnapshot,
  setWorkflowPairCalibrationExcluded,
} from '../../utils/score-calibration-pair-exclusion.util';
import type { QueryScoreCalibrationPairsDto } from './dto/query-score-calibration-pairs.dto';
import type { CreateManualCalibrationSampleDto } from './dto/create-manual-calibration-sample.dto';
import type { UpdateManualCalibrationSampleDto } from './dto/update-manual-calibration-sample.dto';
import type { PredictSemrushScoreDto } from './dto/predict-semrush-score.dto';
import type { QueryScoreCalibrationLabListDto } from './dto/query-score-calibration-lab-list.dto';
import type { CalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';

const JOB_SCAN_SELECT = {
  id: true,
  traceId: true,
  targetKeyword: true,
  seoCheckData: true,
} as const;

@Injectable()
export class ScoreCalibrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async getReadiness(organizationId: string, projectId: string): Promise<ScoreCalibrationReadiness> {
    const { pairs, model } = await this.loadCalibrationData(organizationId, projectId);
    const jobCount = new Set(pairs.map((pair) => pair.jobId)).size;
    return resolveScoreCalibrationReadiness({
      pairCount: pairs.length,
      jobCount,
      model,
    });
  }

  async getSummary(organizationId: string, projectId: string, traceId: string) {
    const { pairs, model, meta, holdoutJobIds, jobs, featureMeans } = await this.loadCalibrationData(
      organizationId,
      projectId,
    );
    const coverage = buildCalibrationCoverage(jobs, pairs);
    const shadowStats = await this.getShadowStats(organizationId, projectId);
    const holdoutPairs = this.filterPairsByDataset(pairs, holdoutJobIds, 'holdout');
    const naiveStats = computePairStats(pairs);
    const holdoutNaiveStats = computePairStats(holdoutPairs);
    const trainStats = this.computeFitStats(pairs, model);
    const holdoutStats = this.computeHoldoutStats(model, holdoutPairs, model);
    const jobCount = new Set(pairs.map((pair) => pair.jobId)).size;
    const readiness = resolveScoreCalibrationReadiness({
      pairCount: pairs.length,
      jobCount,
      model,
    });
    const outlierReasonMap = this.buildPairOutlierReasonMap(pairs);
    const outlierPairCount = outlierReasonMap.size;

    const holdoutHighErrorAttribution =
      model && featureMeans
        ? holdoutPairs
            .map((pair) =>
              this.toPairDto(
                pair,
                model,
                holdoutJobIds,
                featureMeans,
                outlierReasonMap.get(pair.snapshotId),
              ),
            )
            .filter((dto) => (dto.modelAbsError ?? 0) >= 0.4)
            .sort((a, b) => (b.modelAbsError ?? 0) - (a.modelAbsError ?? 0))
            .slice(0, 8)
        : [];

    this.logger.info('Score calibration summary loaded', {
      traceId,
      organizationId,
      projectId,
      snapshotCount: pairs.length,
      rawPairCount: meta.rawPairCount,
      jobCount,
      readinessState: readiness.state,
      modelSampleCount: model?.sampleCount ?? 0,
      holdoutMae: model?.holdoutMae,
      action: 'score_calibration.summary',
    });

    return {
      snapshotCount: pairs.length,
      jobCount,
      extractionMeta: meta,
      coverage,
      readiness,
      minSamplesRequired: SCORE_CALIBRATION_MIN_SAMPLES,
      minJobsForHoldout: SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT,
      modelReady: Boolean(model),
      holdoutReady: Boolean(model?.holdoutSampleCount && model.holdoutSampleCount > 0),
      model,
      featureWeights: model ? listScoreCalibrationModelWeights(model) : [],
      modelIntercept: model?.intercept ?? null,
      naiveMapping: {
        mae: naiveStats.mae,
        rmse: naiveStats.rmse,
        maxAbsError: naiveStats.maxAbsError,
      },
      holdoutNaiveMapping: {
        mae: holdoutNaiveStats.mae,
        rmse: holdoutNaiveStats.rmse,
        maxAbsError: holdoutNaiveStats.maxAbsError,
      },
      trainMapping: trainStats,
      holdoutMapping: holdoutStats,
      calibratedMapping: holdoutStats.holdoutSampleCount > 0 ? holdoutStats : trainStats,
      passThresholds: {
        local: LOCAL_SEO_PASS_THRESHOLD,
        semrush: SEMRUSH_PASS_THRESHOLD,
      },
      localPassRate: this.computePassRate(
        pairs,
        (pair) => pair.localScore >= LOCAL_SEO_PASS_THRESHOLD,
      ),
      semrushPassRate: this.computePassRate(
        pairs,
        (pair) => pair.semrushOverall >= SEMRUSH_PASS_THRESHOLD,
      ),
      errorBuckets: buildErrorBucketStats(pairs),
      holdoutErrorBuckets: this.buildModelErrorBuckets(holdoutPairs, model),
      shadowStats,
      holdoutScatterSample: this.buildScatterSample(holdoutPairs, model),
      holdoutHighErrorAttribution,
      outlierPairCount,
      readinessGates: this.buildReadinessGates(readiness, model),
    };
  }

  async listPairs(
    organizationId: string,
    projectId: string,
    query: QueryScoreCalibrationPairsDto,
  ) {
    const { pairs, displayPairs, model, holdoutJobIds, featureMeans, jobs } = await this.loadCalibrationData(
      organizationId,
      projectId,
    );
    const outlierReasonMap = this.buildPairOutlierReasonMap(displayPairs);
    const dataset = query.dataset ?? 'all';

    if (dataset === 'excluded') {
      const operationalJobs = jobs.filter(
        (job) => !isCalibrationLabImportSeoCheckData(job.seoCheckData),
      );
      const excludedPairs = extractExcludedScoreCalibrationPairs(operationalJobs);
      const enriched = excludedPairs.map((pair) =>
        this.toPairDto(
          pair,
          model,
          holdoutJobIds,
          featureMeans,
          outlierReasonMap.get(pair.snapshotId),
        ),
      );
      return this.paginatePairItems(enriched, query.page ?? 1, query.limit ?? 20);
    }

    const scoped =
      dataset === 'all'
        ? displayPairs
        : this.filterPairsByDataset(pairs, holdoutJobIds, dataset);

    const enriched = scoped.map((pair) =>
      this.toPairDto(
        pair,
        model,
        holdoutJobIds,
        featureMeans,
        outlierReasonMap.get(pair.snapshotId),
      ),
    );
    const filtered = enriched.filter((pair) => {
      if (query.source === 'workflow' && pair.snapshotKind !== 'semrush_check') {
        return false;
      }
      if (query.source === 'manual' && pair.snapshotKind !== 'semrush_manual_check') {
        return false;
      }
      if (query.minAbsError !== undefined && pair.naiveAbsError < query.minAbsError) {
        return false;
      }
      if (query.maxAbsError !== undefined && pair.naiveAbsError > query.maxAbsError) {
        return false;
      }
      if (
        query.minModelAbsError !== undefined &&
        (pair.modelAbsError === null || pair.modelAbsError < query.minModelAbsError)
      ) {
        return false;
      }
      if (
        query.maxModelAbsError !== undefined &&
        (pair.modelAbsError === null || pair.modelAbsError > query.maxModelAbsError)
      ) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => (b.modelAbsError ?? 0) - (a.modelAbsError ?? 0));

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    const slice = filtered.slice(start, start + limit);

    return {
      items: slice,
      pagination: {
        page,
        limit,
        total: filtered.length,
        hasMore: start + limit < filtered.length,
      },
    };
  }

  async setWorkflowPairExcluded(
    organizationId: string,
    projectId: string,
    jobId: string,
    snapshotId: string,
    excluded: boolean,
    traceId: string,
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: JOB_SCAN_SELECT,
    });
    if (!job || isCalibrationLabImportSeoCheckData(job.seoCheckData)) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '流程配对样本不存在');
    }

    const snapshot = findCalibrationSnapshotById(job.seoCheckData, snapshotId);
    if (!snapshot || !isWorkflowCalibrationPairSnapshot(snapshot)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '仅流程 RPA（semrush_check）配对可排除');
    }

    const { seoCheckData } = setWorkflowPairCalibrationExcluded({
      seoCheckData: job.seoCheckData,
      snapshotId,
      excluded,
    });

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { seoCheckData: seoCheckData as object },
    });

    const { pairs, meta } = extractScoreCalibrationPairs(
      await this.prisma.articleJob.findMany({
        where: { organizationId, projectId },
        select: JOB_SCAN_SELECT,
      }),
    );

    this.logger.info('Workflow calibration pair exclusion updated', {
      traceId,
      organizationId,
      projectId,
      jobId,
      snapshotId,
      excluded,
      activePairCount: pairs.length,
      excludedPairCount: meta.excludedPairCount,
      action: excluded ? 'score_calibration.pair_exclude' : 'score_calibration.pair_include',
    });

    return {
      jobId,
      snapshotId,
      excluded,
      activePairCount: pairs.length,
      excludedPairCount: meta.excludedPairCount,
    };
  }

  async listJobsWithoutPairs(
    organizationId: string,
    projectId: string,
    query: QueryScoreCalibrationLabListDto,
  ) {
    const { pairs } = await this.loadCalibrationData(organizationId, projectId);
    const pairedIds = pairs.map((pair) => pair.jobId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = {
      organizationId,
      projectId,
      NOT: { id: { startsWith: CALIBRATION_LAB_JOB_ID_PREFIX } },
      ...(pairedIds.length > 0 ? { id: { notIn: pairedIds } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.articleJob.count({ where }),
      this.prisma.articleJob.findMany({
        where,
        select: {
          id: true,
          targetKeyword: true,
          status: true,
          updatedAt: true,
          semrushScore: true,
          localSeoScore: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: items.map((job) => ({
        jobId: job.id,
        targetKeyword: job.targetKeyword,
        status: job.status,
        updatedAt: job.updatedAt.toISOString(),
        semrushScore: job.semrushScore,
        localSeoScore: job.localSeoScore,
      })),
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    };
  }

  async listShadowLogs(
    organizationId: string,
    projectId: string,
    query: QueryScoreCalibrationLabListDto,
  ) {
    const jobs = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        NOT: { id: { startsWith: CALIBRATION_LAB_JOB_ID_PREFIX } },
      },
      select: {
        id: true,
        targetKeyword: true,
        seoCheckData: true,
      },
    });

    const rows: Array<{
      jobId: string;
      targetKeyword: string;
      entry: CalibrationShadowEntry;
    }> = [];

    for (const job of jobs) {
      const data = (job.seoCheckData ?? {}) as { calibrationShadow?: CalibrationShadowEntry[] };
      const entries = Array.isArray(data.calibrationShadow) ? data.calibrationShadow : [];
      for (const entry of entries) {
        rows.push({ jobId: job.id, targetKeyword: job.targetKeyword, entry });
      }
    }

    rows.sort((a, b) => {
      const errA = a.entry.absError ?? -1;
      const errB = b.entry.absError ?? -1;
      if (errB !== errA) return errB - errA;
      return b.entry.at.localeCompare(a.entry.at);
    });

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    const slice = rows.slice(start, start + limit);

    return {
      items: slice.map(({ jobId, targetKeyword, entry }) => ({
        id: entry.id,
        jobId,
        targetKeyword,
        at: entry.at,
        phase: entry.phase,
        round: entry.round,
        localScore: entry.localScore,
        predictedSemrush: entry.predictedSemrush,
        actualSemrush: entry.actualSemrush,
        absError: entry.absError,
        confidence: entry.confidence,
        decision: entry.decision,
        reason: entry.reason,
        rpaSkipped: entry.rpaSkipped === true,
      })),
      pagination: {
        page,
        limit,
        total: rows.length,
        hasMore: start + limit < rows.length,
      },
    };
  }

  private paginatePairItems<T>(items: T[], page: number, limit: number) {
    const start = (page - 1) * limit;
    const slice = items.slice(start, start + limit);
    return {
      items: slice,
      pagination: {
        page,
        limit,
        total: items.length,
        hasMore: start + limit < items.length,
      },
    };
  }

  async exportTrainingSet(organizationId: string, projectId: string, traceId: string) {
    const { pairs, model } = await this.loadCalibrationData(organizationId, projectId);
    const rows = pairs.map((pair) =>
      buildCalibrationExportRow({
        jobId: pair.jobId,
        traceId: pair.traceId,
        targetKeyword: pair.targetKeyword,
        snapshotId: pair.snapshotId,
        snapshotKind: pair.snapshotKind,
        checkedAt: pair.checkedAt,
        localScore: pair.localScore,
        semrushOverall: pair.semrushOverall,
        features: pair.features,
      }),
    );

    this.logger.info('Score calibration export generated', {
      traceId,
      organizationId,
      projectId,
      rowCount: rows.length,
      action: 'score_calibration.export',
    });

    return {
      rowCount: rows.length,
      exportedAt: new Date().toISOString(),
      modelHoldoutMae: model?.holdoutMae ?? null,
      rows,
    };
  }

  async listManualSamples(organizationId: string, projectId: string) {
    await this.migrateLegacyManualSamples(organizationId, projectId);
    const jobs = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        seoCheckData: { path: [CALIBRATION_LAB_IMPORT_FLAG], equals: true },
      },
      select: {
        id: true,
        targetKeyword: true,
        localSeoScore: true,
        semrushScore: true,
        seoCheckData: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_MANUAL_CALIBRATION_SAMPLES,
    });

    return jobs.map((job) => {
      const check = (job.seoCheckData ?? {}) as {
        sourceNote?: string;
        importedAt?: string;
        analysisSnapshots?: Array<{ id?: string; title?: string; checkedAt?: string }>;
      };
      const snapshot = check.analysisSnapshots?.[0];
      return {
        jobId: job.id,
        sampleId: snapshot?.id ?? job.id,
        title: snapshot?.title ?? job.targetKeyword,
        targetKeyword: job.targetKeyword,
        localScore: job.localSeoScore ?? 0,
        semrushOverall: job.semrushScore ?? 0,
        sourceNote: check.sourceNote,
        importedAt: check.importedAt ?? job.updatedAt.toISOString(),
        checkedAt: snapshot?.checkedAt ?? check.importedAt ?? job.updatedAt.toISOString(),
      };
    });
  }

  async getManualSample(organizationId: string, projectId: string, jobId: string) {
    const job = await this.findManualSampleJob(organizationId, projectId, jobId);
    const check = (job.seoCheckData ?? {}) as {
      sourceNote?: string;
      importedAt?: string;
      analysisSnapshots?: SeoAnalysisSnapshot[];
    };
    const snapshot = check.analysisSnapshots?.[0];
    const draft = (job.draftData ?? {}) as { content?: string };
    const content =
      draft.content?.trim() ||
      snapshot?.content?.trim() ||
      snapshot?.contentPreview?.trim() ||
      '';

    return {
      jobId: job.id,
      sampleId: snapshot?.id ?? job.id,
      targetKeyword: job.targetKeyword,
      submittedKeywords: snapshot?.submittedKeywords ?? [job.targetKeyword],
      content,
      semrushOverall: job.semrushScore ?? snapshot?.semrushOverall ?? 0,
      semrushNodeLabel: snapshot?.semrushNodeLabel ?? snapshot?.semrushNode,
      semrushCurrentWordCount: snapshot?.semrushCurrentWordCount,
      semrushCompetitorWordCount: snapshot?.semrushCompetitorWordCount,
      semrushReadabilityScore: snapshot?.semrushReadabilityScore,
      sourceNote: check.sourceNote,
      importedAt: check.importedAt ?? job.updatedAt.toISOString(),
      localScore: job.localSeoScore ?? snapshot?.localScore ?? 0,
    };
  }

  async updateManualSample(
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: UpdateManualCalibrationSampleDto,
    traceId: string,
  ) {
    const job = await this.findManualSampleJob(organizationId, projectId, jobId);
    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    const existingSnapshot = Array.isArray(prevCheck.analysisSnapshots)
      ? (prevCheck.analysisSnapshots as SeoAnalysisSnapshot[])[0]
      : undefined;

    const built = this.buildManualSampleArtifacts(dto, existingSnapshot?.id);

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        targetKeyword: built.primaryKeyword,
        localSeoScore: built.localResult.score,
        semrushScore: dto.semrushOverall,
        draftData: { content: built.content } as object,
        seoCheckData: {
          ...prevCheck,
          [CALIBRATION_LAB_IMPORT_FLAG]: true,
          sourceNote: dto.sourceNote?.trim() || undefined,
          analysisSnapshots: [built.snapshot],
        } as object,
      },
    });

    this.logger.info('Manual calibration sample updated', {
      traceId,
      organizationId,
      projectId,
      jobId,
      sampleId: built.snapshot.id,
      localScore: built.localResult.score,
      semrushOverall: dto.semrushOverall,
      action: 'score_calibration.manual_update',
    });

    return {
      sampleId: built.snapshot.id,
      jobId,
      title: built.snapshot.title,
      targetKeyword: built.primaryKeyword,
      localScore: built.localResult.score,
      semrushOverall: dto.semrushOverall,
      naiveMapped: built.naiveMapped,
      naiveAbsError: built.naiveAbsError,
      labelWarning: buildCalibrationLabelWarning(built.naiveMapped, dto.semrushOverall),
      checkedAt: built.snapshot.checkedAt,
    };
  }

  async deleteManualSample(
    organizationId: string,
    projectId: string,
    jobId: string,
    traceId: string,
  ) {
    const deleted = await this.prisma.articleJob.deleteMany({
      where: {
        id: jobId,
        organizationId,
        projectId,
        seoCheckData: { path: [CALIBRATION_LAB_IMPORT_FLAG], equals: true },
      },
    });
    if (deleted.count === 0) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '手动样本不存在');
    }

    const manualSampleCount = await this.prisma.articleJob.count({
      where: {
        organizationId,
        projectId,
        seoCheckData: { path: [CALIBRATION_LAB_IMPORT_FLAG], equals: true },
      },
    });

    this.logger.info('Manual calibration sample deleted', {
      traceId,
      organizationId,
      projectId,
      jobId,
      manualSampleCount,
      action: 'score_calibration.manual_delete',
    });

    return { jobId, manualSampleCount };
  }

  async createManualSample(
    organizationId: string,
    projectId: string,
    dto: CreateManualCalibrationSampleDto,
    traceId: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, config: true },
    });
    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    await this.migrateLegacyManualSamples(organizationId, projectId, project.config);

    const manualCount = await this.prisma.articleJob.count({
      where: {
        organizationId,
        projectId,
        seoCheckData: { path: [CALIBRATION_LAB_IMPORT_FLAG], equals: true },
      },
    });
    if (manualCount >= MAX_MANUAL_CALIBRATION_SAMPLES) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `手动样本已达上限 ${MAX_MANUAL_CALIBRATION_SAMPLES} 条`,
      );
    }

    const site = await this.resolveCalibrationLabSite(organizationId, projectId);

    const built = this.buildManualSampleArtifacts(dto);
    const importedAt = new Date().toISOString();
    const jobId = buildCalibrationLabJobId();

    await this.prisma.articleJob.create({
      data: {
        id: jobId,
        traceId: jobId,
        organizationId,
        projectId,
        siteId: site.id,
        targetKeyword: built.primaryKeyword,
        contentLanguage: site.contentLanguage,
        status: 'COMPLETED',
        localSeoScore: built.localResult.score,
        semrushScore: dto.semrushOverall,
        draftData: { content: built.content } as object,
        seoCheckData: {
          [CALIBRATION_LAB_IMPORT_FLAG]: true,
          sourceNote: dto.sourceNote?.trim() || undefined,
          importedAt,
          analysisSnapshots: [built.snapshot],
        } as object,
      },
    });

    this.logger.info('Manual calibration sample imported', {
      traceId,
      organizationId,
      projectId,
      sampleId: built.snapshot.id,
      jobId,
      localScore: built.localResult.score,
      semrushOverall: dto.semrushOverall,
      manualSampleCount: manualCount + 1,
      action: 'score_calibration.manual_import',
    });

    return {
      sampleId: built.snapshot.id,
      jobId,
      title: built.snapshot.title,
      targetKeyword: built.primaryKeyword,
      localScore: built.localResult.score,
      semrushOverall: dto.semrushOverall,
      naiveMapped: built.naiveMapped,
      naiveAbsError: built.naiveAbsError,
      labelWarning: buildCalibrationLabelWarning(built.naiveMapped, dto.semrushOverall),
      manualSampleCount: manualCount + 1,
      checkedAt: built.snapshot.checkedAt,
    };
  }

  async predict(
    organizationId: string,
    projectId: string,
    dto: PredictSemrushScoreDto,
    traceId: string,
  ) {
    const { model, featureMeans } = await this.loadCalibrationData(organizationId, projectId);
    const result = scoreArticleContent({
      targetKeyword: dto.targetKeyword,
      content: dto.content,
      submittedKeywords: [dto.targetKeyword],
      targetWordCount: dto.targetWordCount,
      competitorWordCount: dto.competitorWordCount,
      model,
      featureMeans,
    });

    this.logger.info('Score calibration predict', {
      traceId,
      organizationId,
      projectId,
      localScore: result.localScore,
      predictedSemrush: result.overall,
      confidence: result.confidence,
      action: 'score_calibration.predict',
    });

    return {
      localScore: result.localScore,
      localBreakdown: result.localBreakdown,
      localSuggestions: result.suggestions,
      naiveMapped: Math.round((result.localScore / 10) * 100) / 100,
      evalMae: result.evalMae,
      predictedSemrush: result.overall,
      passed: result.passed,
      pointsToGo: result.pointsToGo,
      confidence: result.confidence,
      modelSampleCount: model?.sampleCount ?? 0,
      usedFallback: result.usedFallback,
      primaryNode: result.primaryNode,
      missingKeywords: result.missingKeywords,
      missingKeywordCount: result.missingKeywordCount,
      wordCount: result.wordCount,
      featureAttribution: result.featureAttribution,
      passThresholds: {
        local: LOCAL_SEO_PASS_THRESHOLD,
        semrush: SEMRUSH_PASS_THRESHOLD,
      },
    };
  }

  async loadProjectCalibration(organizationId: string, projectId: string) {
    const { model, featureMeans } = await this.loadCalibrationData(organizationId, projectId);
    return { model, featureMeans };
  }

  async getShadowStats(organizationId: string, projectId: string) {
    const jobs = await this.prisma.articleJob.findMany({
      where: { organizationId, projectId },
      select: { seoCheckData: true },
    });
    const entries = jobs.flatMap((job) => {
      const data = (job.seoCheckData ?? {}) as { calibrationShadow?: unknown[] };
      return Array.isArray(data.calibrationShadow) ? data.calibrationShadow : [];
    });
    return aggregateCalibrationShadowStats(
      entries as Parameters<typeof aggregateCalibrationShadowStats>[0],
    );
  }

  private async loadCalibrationData(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { config: true },
    });
    await this.migrateLegacyManualSamples(organizationId, projectId, project?.config);

    const jobs = await this.prisma.articleJob.findMany({
      where: { organizationId, projectId },
      select: JOB_SCAN_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    const { pairs, meta } = extractScoreCalibrationPairs(jobs);
    const { pairs: displayPairs } = extractScoreCalibrationPairs(jobs, {
      includeLegacyScoreVersions: true,
    });
    const manualImportCount = jobs.filter((job) =>
      isCalibrationLabImportSeoCheckData(job.seoCheckData),
    ).length;
    const workflowPairCount = displayPairs.filter(
      (pair) => pair.snapshotKind === 'semrush_check',
    ).length;
    const manualPairCount = displayPairs.filter(
      (pair) => pair.snapshotKind === 'semrush_manual_check',
    ).length;
    const operationalJobs = jobs.filter(
      (job) => !isCalibrationLabImportSeoCheckData(job.seoCheckData),
    );
    const trainingRows = toCalibrationTrainingRows(pairs);
    const holdoutJobIds = resolveHoldoutJobIds(trainingRows);
    const model = trainScoreCalibrationModel(trainingRows);
    const featureMeans = computeScoreCalibrationFeatureMeans(pairs.map((pair) => pair.features));
    return {
      pairs,
      displayPairs,
      model,
      meta: {
        ...meta,
        manualImportCount,
        workflowPairCount,
        manualPairCount,
      },
      holdoutJobIds,
      jobs: operationalJobs,
      featureMeans,
    };
  }

  private buildManualSampleArtifacts(
    dto: CreateManualCalibrationSampleDto,
    existingSnapshotId?: string,
  ) {
    const content = normalizeArticleScoreContent(dto.content.trim());
    if (content.length < 80) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文过短，至少 80 字符');
    }

    const { primaryKeyword, keywordList } = resolveArticleScoreKeywordList({
      targetKeyword: dto.targetKeyword.trim(),
      submittedKeywords: dto.submittedKeywords,
    });
    const localResult = scoreLocalSeo({
      keyword: primaryKeyword,
      submittedKeywords: keywordList.length > 1 ? keywordList.slice(1) : undefined,
      content,
      targetWordCount: dto.targetWordCount,
      competitorWordCount: dto.semrushCompetitorWordCount,
    });
    const missingKeywordCount = findMissingSemrushKeywords(content, keywordList).length;
    const semrushResult: SeoScore = {
      overall: dto.semrushOverall,
      suggestions: [],
      nodeLabel: dto.semrushNodeLabel?.trim() || undefined,
      semrushCurrentWordCount: dto.semrushCurrentWordCount,
      semrushCompetitorWordCount: dto.semrushCompetitorWordCount,
      semrushReadabilityScore: dto.semrushReadabilityScore,
      semrushTargetKeywords: keywordList,
      analysisSource: 'dom',
    };
    const snapshot = buildSemrushAnalysisSnapshot({
      content,
      targetKeyword: primaryKeyword,
      submittedKeywords: keywordList,
      semrushResult,
      localResult,
      kind: 'semrush_manual_check',
      includeFullContent: true,
      semrushMissingKeywordCount: missingKeywordCount,
    });
    if (existingSnapshotId) {
      snapshot.id = existingSnapshotId;
    }
    const naiveMapped = Math.round((localResult.score / 10) * 100) / 100;
    const naiveAbsError = Math.round(Math.abs(naiveMapped - dto.semrushOverall) * 100) / 100;

    return {
      content,
      primaryKeyword,
      keywordList,
      localResult,
      snapshot,
      naiveMapped,
      naiveAbsError,
    };
  }

  private async findManualSampleJob(
    organizationId: string,
    projectId: string,
    jobId: string,
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        targetKeyword: true,
        localSeoScore: true,
        semrushScore: true,
        draftData: true,
        seoCheckData: true,
        updatedAt: true,
      },
    });
    if (!job || !isCalibrationLabImportSeoCheckData(job.seoCheckData)) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '手动样本不存在');
    }
    return job;
  }

  private async resolveCalibrationLabSite(organizationId: string, projectId: string) {
    const site = await this.prisma.site.findFirst({
      where: { organizationId, projectId },
      select: { id: true, contentLanguage: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '请先在「站点」创建站点后再录入样本');
    }
    return site;
  }

  /** 将旧版 project.config 中的样本迁移为 ArticleJob（一次性自愈） */
  private async migrateLegacyManualSamples(
    organizationId: string,
    projectId: string,
    config?: unknown,
  ): Promise<number> {
    const legacy = readManualCalibrationSamples(config);
    if (legacy.length === 0) {
      return 0;
    }

    const site = await this.prisma.site.findFirst({
      where: { organizationId, projectId },
      select: { id: true, contentLanguage: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!site) {
      return 0;
    }

    let migrated = 0;
    for (const sample of legacy) {
      const exists = await this.prisma.articleJob.findFirst({
        where: { id: sample.jobId, organizationId, projectId },
        select: { id: true },
      });
      if (exists) {
        migrated += 1;
        continue;
      }

      const traceTaken = await this.prisma.articleJob.findFirst({
        where: { traceId: sample.traceId },
        select: { id: true },
      });
      const traceId = traceTaken ? buildCalibrationLabJobId() : sample.traceId;
      const jobId = traceTaken ? buildCalibrationLabJobId() : sample.jobId;

      await this.prisma.articleJob.create({
        data: {
          id: jobId,
          traceId,
          organizationId,
          projectId,
          siteId: site.id,
          targetKeyword: sample.snapshot.targetKeyword,
          contentLanguage: site.contentLanguage,
          status: 'COMPLETED',
          localSeoScore: sample.snapshot.localScore,
          semrushScore: sample.snapshot.semrushOverall,
          draftData: sample.snapshot.content
            ? ({ content: sample.snapshot.content } as object)
            : undefined,
          seoCheckData: {
            [CALIBRATION_LAB_IMPORT_FLAG]: true,
            sourceNote: sample.sourceNote,
            importedAt: sample.importedAt,
            legacyConfigMigrated: true,
            analysisSnapshots: [sample.snapshot],
          } as object,
        },
      });
      migrated += 1;
    }

    if (legacy.length > 0) {
      const cleared = clearManualCalibrationSamplesConfig(config);
      await this.prisma.project.update({
        where: { id: projectId },
        data: { config: cleared as object },
      });
      if (migrated > 0) {
        this.logger.info('Migrated legacy manual calibration samples', {
          organizationId,
          projectId,
          migrated,
          action: 'score_calibration.legacy_migrate',
        });
      }
    }

    return migrated;
  }

  private filterPairsByDataset(
    pairs: ScoreCalibrationPairRecord[],
    holdoutJobIds: Set<string>,
    dataset: 'all' | 'holdout' | 'train',
  ): ScoreCalibrationPairRecord[] {
    if (dataset === 'all' || holdoutJobIds.size === 0) {
      return pairs;
    }
    if (dataset === 'holdout') {
      return pairs.filter((pair) => holdoutJobIds.has(pair.jobId));
    }
    return pairs.filter((pair) => !holdoutJobIds.has(pair.jobId));
  }

  private buildScatterSample(
    pairs: ScoreCalibrationPairRecord[],
    model: ScoreCalibrationModel | null,
  ) {
    return pairs.slice(0, 120).map((pair) => {
      const predicted = model
        ? predictCalibratedSemrushScore({
            features: pair.features,
            localScore: pair.localScore,
            model,
          }).predictedSemrush
        : pair.naiveMapped;
      const modelAbsError = Math.round(Math.abs(predicted - pair.semrushOverall) * 100) / 100;
      return {
        localMapped: pair.naiveMapped,
        semrushOverall: pair.semrushOverall,
        predictedSemrush: predicted,
        absError: pair.absError,
        modelAbsError,
      };
    });
  }

  private buildModelErrorBuckets(
    pairs: ScoreCalibrationPairRecord[],
    model: ScoreCalibrationModel | null,
  ) {
    if (!model || pairs.length === 0) {
      return [];
    }
    const buckets = [
      { label: '≤0.2', min: 0, max: 0.2 },
      { label: '0.2–0.5', min: 0.2, max: 0.5 },
      { label: '0.5–1.0', min: 0.5, max: 1.0 },
      { label: '>1.0', min: 1.0, max: Infinity },
    ];
    return buckets.map((bucket) => {
      const matched = pairs.filter((pair) => {
        const predicted = predictCalibratedSemrushScore({
          features: pair.features,
          localScore: pair.localScore,
          model,
        }).predictedSemrush;
        const err = Math.abs(predicted - pair.semrushOverall);
        return err >= bucket.min && err < bucket.max;
      });
      const avgAbsError =
        matched.length === 0
          ? 0
          : Math.round(
              (matched.reduce((sum, pair) => {
                const predicted = predictCalibratedSemrushScore({
                  features: pair.features,
                  localScore: pair.localScore,
                  model,
                }).predictedSemrush;
                return sum + Math.abs(predicted - pair.semrushOverall);
              }, 0) /
                matched.length) *
                100,
            ) / 100;
      return { label: bucket.label, count: matched.length, avgAbsError };
    });
  }

  private computeFitStats(pairs: ScoreCalibrationPairRecord[], model: ScoreCalibrationModel | null) {
    if (!model || pairs.length === 0) {
      return { mae: 0, rmse: 0, maxAbsError: 0, sampleCount: 0 };
    }
    return {
      mae: model.mae,
      rmse: model.rmse,
      maxAbsError: this.computeMaxModelError(pairs, model),
      sampleCount: model.trainSampleCount ?? model.sampleCount,
    };
  }

  private computeHoldoutStats(
    model: ScoreCalibrationModel | null,
    holdoutPairs: ScoreCalibrationPairRecord[],
    fittedModel: ScoreCalibrationModel | null,
  ) {
    if (!model?.holdoutSampleCount) {
      return { mae: 0, rmse: 0, maxAbsError: 0, holdoutSampleCount: 0, holdoutJobCount: 0 };
    }
    const maxAbsError =
      fittedModel && holdoutPairs.length > 0
        ? this.computeMaxModelError(holdoutPairs, fittedModel)
        : 0;
    return {
      mae: model.holdoutMae ?? 0,
      rmse: model.holdoutRmse ?? 0,
      maxAbsError,
      holdoutSampleCount: model.holdoutSampleCount,
      holdoutJobCount: model.holdoutJobCount ?? 0,
    };
  }

  private computeMaxModelError(
    pairs: ScoreCalibrationPairRecord[],
    model: ScoreCalibrationModel,
  ): number {
    let maxAbsError = 0;
    for (const pair of pairs) {
      const predicted = predictCalibratedSemrushScore({
        features: pair.features,
        localScore: pair.localScore,
        model,
      }).predictedSemrush;
      maxAbsError = Math.max(maxAbsError, Math.abs(predicted - pair.semrushOverall));
    }
    return Math.round(maxAbsError * 100) / 100;
  }

  private computePassRate(
    pairs: ScoreCalibrationPairRecord[],
    predicate: (pair: ScoreCalibrationPairRecord) => boolean,
  ): number {
    if (pairs.length === 0) return 0;
    const passed = pairs.filter(predicate).length;
    return Math.round((passed / pairs.length) * 1000) / 10;
  }

  private buildPairOutlierReasonMap(pairs: ScoreCalibrationPairRecord[]): Map<string, string> {
    const flags = detectCalibrationPairOutliers(pairs.map((pair) => pair.targetKeyword));
    const map = new Map<string, string>();
    for (const flag of flags) {
      const pair = pairs[flag.index];
      if (pair) {
        map.set(pair.snapshotId, flag.reason);
      }
    }
    return map;
  }

  private buildReadinessGates(
    readiness: ScoreCalibrationReadiness,
    model: ScoreCalibrationModel | null,
  ) {
    const trainCount = model?.trainSampleCount ?? model?.sampleCount ?? 0;
    const holdoutCount = readiness.holdoutSampleCount;
    const holdoutMae = readiness.holdoutMae;

    return {
      trial: {
        holdoutSamples: { current: holdoutCount, required: SCORE_CALIBRATION_TRIAL_HOLDOUT_MIN },
        holdoutMae: {
          current: holdoutMae,
          max: SCORE_CALIBRATION_TRIAL_HOLDOUT_MAE,
          met: holdoutMae !== null && holdoutMae <= SCORE_CALIBRATION_TRIAL_HOLDOUT_MAE,
        },
        passSamples: {
          current: model?.holdoutPassSampleCount ?? 0,
          required: SCORE_CALIBRATION_TRIAL_PASS_MIN,
        },
        passRecall: {
          current: model?.holdoutPassRecall ?? 0,
          min: SCORE_CALIBRATION_TRIAL_PASS_RECALL,
        },
      },
      production: {
        holdoutSamples: { current: holdoutCount, required: SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN },
        trainSamples: { current: trainCount, required: 30 },
        holdoutMae: { current: holdoutMae, max: 0.35 },
        passSamples: {
          current: model?.holdoutPassSampleCount ?? 0,
          required: SCORE_CALIBRATION_PRODUCTION_PASS_MIN,
        },
        passRecall: {
          current: model?.holdoutPassRecall ?? 0,
          min: SCORE_CALIBRATION_PRODUCTION_PASS_RECALL,
        },
      },
      confidenceNote:
        '列表「置信度」为整模型门控：验证样本不足时全部为低，不代表单条校准误差大。',
    };
  }

  private toPairDto(
    pair: ScoreCalibrationPairRecord,
    model: ScoreCalibrationModel | null,
    holdoutJobIds?: Set<string>,
    featureMeans?: ScoreCalibrationFeatures | null,
    outlierReason?: string,
  ) {
    const prediction = predictCalibratedSemrushScore({
      features: pair.features,
      localScore: pair.localScore,
      model,
    });
    const modelError =
      Math.round(
        Math.abs(prediction.predictedSemrush - pair.semrushOverall) * 100,
      ) / 100;
    const signedModelError = model
      ? Math.round((prediction.predictedSemrush - pair.semrushOverall) * 100) / 100
      : null;
    const featureAttribution =
      model && featureMeans
        ? attributeScoreCalibrationDrivers({
            model,
            features: pair.features,
            featureMeans,
            limit: 12,
          })
        : [];
    const topFeatureDrivers = featureAttribution.slice(0, 3);

    return {
      jobId: pair.jobId,
      traceId: pair.traceId,
      targetKeyword: pair.targetKeyword,
      snapshotId: pair.snapshotId,
      snapshotKind: pair.snapshotKind,
      checkedAt: pair.checkedAt,
      title: pair.title,
      localScore: pair.localScore,
      semrushOverall: pair.semrushOverall,
      naiveMapped: pair.naiveMapped,
      predictedSemrush: prediction.predictedSemrush,
      naiveAbsError: pair.absError,
      modelAbsError: model ? modelError : null,
      signedModelError,
      isHoldout: holdoutJobIds ? holdoutJobIds.has(pair.jobId) : false,
      missingKeywordsBackfilled: pair.missingKeywordsBackfilled === true,
      localScoreVersion: pair.localScoreVersion ?? null,
      trainingEligible: pair.trainingEligible,
      topFeatureDrivers,
      featureAttribution,
      confidence: prediction.confidence,
      semrushNodeLabel: pair.semrushNodeLabel,
      possiblyOutlier: Boolean(outlierReason),
      outlierReason: outlierReason ?? null,
    };
  }
}
