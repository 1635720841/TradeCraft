/**
 * 评分校准：模型加载、预测、就绪度与汇总统计。
 *
 * 边界：
 * - 不负责：实验室样本 CRUD（ScoreCalibrationLabService）
 *
 * 入口：
 * - ScoreCalibrationPredictService
 */

import { Injectable } from '@nestjs/common';
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT,
  SCORE_CALIBRATION_MIN_SAMPLES,
  attributeScoreCalibrationDrivers,
  computeScoreCalibrationFeatureMeans,
  listScoreCalibrationModelWeights,
  predictCalibratedSemrushScore,
  resolveHoldoutJobIds,
  resolveScoreCalibrationReadiness,
  trainScoreCalibrationModel,
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
  detectCalibrationPairOutliers,
} from '@wm/shared-core';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { SEMRUSH_PASS_THRESHOLD } from '../../constants/seo-score';
import {
  buildErrorBucketStats,
  buildCalibrationCoverage,
  computePairStats,
  extractScoreCalibrationPairs,
  toCalibrationTrainingRows,
  type ScoreCalibrationPairRecord,
} from '../../utils/score-calibration-pairs.util';
import { scoreArticleContent } from '../../utils/article-content-score.util';
import {
  buildCalibrationLabJobId,
  CALIBRATION_LAB_IMPORT_FLAG,
  clearManualCalibrationSamplesConfig,
  isCalibrationLabImportSeoCheckData,
  readManualCalibrationSamples,
} from '../../utils/score-calibration-manual-samples.util';
import { aggregateCalibrationShadowStats } from '../../utils/score-calibration-runtime.util';
import type { PredictSemrushScoreDto } from './dto/predict-semrush-score.dto';

const JOB_SCAN_SELECT = {
  id: true,
  traceId: true,
  targetKeyword: true,
  seoCheckData: true,
} as const;

@Injectable()
export class ScoreCalibrationPredictService {
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

  async loadCalibrationData(organizationId: string, projectId: string) {
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

  /** 将旧版 project.config 中的样本迁移为 ArticleJob（一次性自愈） */
  async migrateLegacyManualSamples(
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

  filterPairsByDataset(
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

  buildPairOutlierReasonMap(pairs: ScoreCalibrationPairRecord[]): Map<string, string> {
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

  toPairDto(
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
}
