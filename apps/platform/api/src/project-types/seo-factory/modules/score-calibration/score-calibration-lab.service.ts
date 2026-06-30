/**
 * 评分校准实验室：手动样本 CRUD、配对列表与训练集导出。
 *
 * 边界：
 * - 不负责：模型预测与就绪度（ScoreCalibrationPredictService）
 *
 * 入口：
 * - ScoreCalibrationLabService
 */

import { Injectable } from '@nestjs/common';
import type { SeoScore } from '@wm/provider-interfaces';
import {
  buildCalibrationExportRow,
  buildCalibrationLabelWarning,
  normalizeArticleScoreContent,
  resolveArticleScoreKeywordList,
  scoreLocalSeo,
} from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  extractExcludedScoreCalibrationPairs,
  extractScoreCalibrationPairs,
} from '../../utils/score-calibration-pairs.util';
import { findMissingSemrushKeywords } from '../../providers/semrush/semrush-keyword-coverage.util';
import {
  buildCalibrationLabJobId,
  CALIBRATION_LAB_IMPORT_FLAG,
  CALIBRATION_LAB_JOB_ID_PREFIX,
  isCalibrationLabImportSeoCheckData,
  MAX_MANUAL_CALIBRATION_SAMPLES,
} from '../../utils/score-calibration-manual-samples.util';
import { buildSemrushAnalysisSnapshot, type SeoAnalysisSnapshot } from '../../utils/seo-analysis-snapshot.util';
import {
  findCalibrationSnapshotById,
  isWorkflowCalibrationPairSnapshot,
  setWorkflowPairCalibrationExcluded,
} from '../../utils/score-calibration-pair-exclusion.util';
import type { CalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import type { QueryScoreCalibrationPairsDto } from './dto/query-score-calibration-pairs.dto';
import type { CreateManualCalibrationSampleDto } from './dto/create-manual-calibration-sample.dto';
import type { UpdateManualCalibrationSampleDto } from './dto/update-manual-calibration-sample.dto';
import type { QueryScoreCalibrationLabListDto } from './dto/query-score-calibration-lab-list.dto';
import { ScoreCalibrationPredictService } from './score-calibration-predict.service';

const JOB_SCAN_SELECT = {
  id: true,
  traceId: true,
  targetKeyword: true,
  seoCheckData: true,
} as const;

@Injectable()
export class ScoreCalibrationLabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly predictService: ScoreCalibrationPredictService,
  ) {}

  async listPairs(
    organizationId: string,
    projectId: string,
    query: QueryScoreCalibrationPairsDto,
  ) {
    const { pairs, displayPairs, model, holdoutJobIds, featureMeans, jobs } =
      await this.predictService.loadCalibrationData(organizationId, projectId);
    const outlierReasonMap = this.predictService.buildPairOutlierReasonMap(displayPairs);
    const dataset = query.dataset ?? 'all';

    if (dataset === 'excluded') {
      const operationalJobs = jobs.filter(
        (job) => !isCalibrationLabImportSeoCheckData(job.seoCheckData),
      );
      const excludedPairs = extractExcludedScoreCalibrationPairs(operationalJobs);
      const enriched = excludedPairs.map((pair) =>
        this.predictService.toPairDto(
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
        : this.predictService.filterPairsByDataset(pairs, holdoutJobIds, dataset);

    const enriched = scoped.map((pair) =>
      this.predictService.toPairDto(
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
    const { pairs } = await this.predictService.loadCalibrationData(organizationId, projectId);
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

  async exportTrainingSet(organizationId: string, projectId: string, traceId: string) {
    const { pairs, model } = await this.predictService.loadCalibrationData(organizationId, projectId);
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
    await this.predictService.migrateLegacyManualSamples(organizationId, projectId);
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

    await this.predictService.migrateLegacyManualSamples(organizationId, projectId, project.config);

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
}
