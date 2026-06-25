/**
 * Semrush 评分反推实验服务：保存基线、单变量稿与人工重复检测结果。
 *
 * 边界：
 * - 不负责：真实 Semrush 检测、校准模型训练
 *
 * 入口：
 * - ScoreReverseExperimentService
 */

import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER, type ILLMProvider } from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  SCORE_REVERSE_MAX_EXPERIMENTS,
  aggregateScoreReverseRuleEvidence,
  createStoredScoreReverseExperiment,
  hashScoreReverseContent,
  hashScoreReverseKeywordSet,
  readStoredScoreReverseExperiments,
  toScoreReverseExperimentDto,
  writeStoredScoreReverseExperiments,
} from '../../utils/score-reverse-experiment.util';
import type { CreateScoreReverseExperimentDto } from './dto/create-score-reverse-experiment.dto';
import type { UpdateScoreReverseTrialsDto } from './dto/update-score-reverse-trials.dto';
import type { RunScoreReverseTrialDto } from './dto/run-score-reverse-trial.dto';
import { SemrushQueueService } from '../../services/semrush-queue.service';

@Injectable()
export class ScoreReverseExperimentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILLMProvider,
    private readonly semrushQueue: SemrushQueueService,
  ) {}

  async list(organizationId: string, projectId: string) {
    const { experiments } = await this.load(organizationId, projectId);
    return experiments.map(toScoreReverseExperimentDto);
  }

  async evidence(organizationId: string, projectId: string) {
    const { experiments } = await this.load(organizationId, projectId);
    return aggregateScoreReverseRuleEvidence(experiments);
  }

  async create(
    organizationId: string,
    projectId: string,
    dto: CreateScoreReverseExperimentDto,
    traceId: string,
  ) {
    const loaded = await this.load(organizationId, projectId);
    if (loaded.experiments.length >= SCORE_REVERSE_MAX_EXPERIMENTS) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `反推实验最多保留 ${SCORE_REVERSE_MAX_EXPERIMENTS} 组，请删除旧实验后再创建`,
      );
    }
    const experiment = createStoredScoreReverseExperiment(dto);
    const ineffective = toScoreReverseExperimentDto(experiment).variants.filter(
      (variant) => variant.key !== 'baseline' && variant.content === experiment.baselineContent,
    );
    if (ineffective.length > 0) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `基线正文无法生成这些单变量：${ineffective.map((variant) => variant.label).join('、')}。请补充相应结构或取消变量`,
      );
    }
    await this.save(projectId, loaded.config, [experiment, ...loaded.experiments]);
    this.logger.info('Score reverse experiment created', {
      traceId,
      organizationId,
      projectId,
      experimentId: experiment.id,
      factorCount: experiment.factors.length,
      action: 'score_reverse.create',
    });
    return toScoreReverseExperimentDto(experiment);
  }

  async updateTrials(
    organizationId: string,
    projectId: string,
    experimentId: string,
    dto: UpdateScoreReverseTrialsDto,
    traceId: string,
  ) {
    const loaded = await this.load(organizationId, projectId);
    const index = loaded.experiments.findIndex((item) => item.id === experimentId);
    if (index < 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '反推实验不存在');
    }
    const experiment = loaded.experiments[index];
    if (dto.variantKey !== 'baseline' && !experiment.factors.includes(dto.variantKey)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '实验变量不存在');
    }
    const variant = toScoreReverseExperimentDto(experiment).variants.find(
      (item) => item.key === dto.variantKey,
    );
    if (!variant) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '实验变量不存在');
    }
    const contentHash = hashScoreReverseContent(variant.content);
    const keywordSetHash = hashScoreReverseKeywordSet(experiment.submittedKeywords);
    experiment.trials[dto.variantKey] = dto.trials.map((trial, index) => {
      const nodeLabel = trial.nodeLabel?.trim();
      const databaseLabel = trial.databaseLabel?.trim();
      return {
        score: Math.round(trial.score * 10) / 10,
        round: trial.round ?? index + 1,
        ...(nodeLabel ? { nodeLabel } : {}),
        ...(databaseLabel ? { databaseLabel } : {}),
        contentHash,
        keywordSetHash,
        checkedAt: trial.checkedAt ? new Date(trial.checkedAt).toISOString() : new Date().toISOString(),
      };
    });
    const observations = { ...(experiment.observations ?? {}) };
    const observation = dto.observation?.trim();
    if (observation) observations[dto.variantKey] = observation;
    else delete observations[dto.variantKey];
    experiment.observations = observations;
    experiment.updatedAt = new Date().toISOString();
    loaded.experiments[index] = experiment;
    await this.save(projectId, loaded.config, loaded.experiments);
    this.logger.info('Score reverse experiment trials updated', {
      traceId,
      organizationId,
      projectId,
      experimentId,
      variantKey: dto.variantKey,
      trialCount: dto.trials.length,
      action: 'score_reverse.update_trials',
    });
    return toScoreReverseExperimentDto(experiment);
  }

  async runTrial(
    organizationId: string,
    projectId: string,
    experimentId: string,
    dto: RunScoreReverseTrialDto,
    traceId: string,
  ) {
    const loaded = await this.load(organizationId, projectId);
    const experiment = loaded.experiments.find((item) => item.id === experimentId);
    if (!experiment) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '反推实验不存在');
    }
    if (dto.variantKey !== 'baseline' && !experiment.factors.includes(dto.variantKey)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '实验变量不存在');
    }
    const variant = toScoreReverseExperimentDto(experiment).variants.find(
      (item) => item.key === dto.variantKey,
    );
    if (!variant) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '实验变量不存在');
    }
    const baselineTrials = experiment.trials.baseline ?? [];
    const preferredNodeKey =
      dto.preferredNodeKey?.trim() ||
      baselineTrials.find((trial) => (trial.round ?? 0) === dto.round)?.nodeKey ||
      baselineTrials.find((trial) => trial.nodeKey)?.nodeKey ||
      Object.values(experiment.trials).flat().find((trial) => trial?.nodeKey)?.nodeKey;
    const result = await this.semrushQueue.runCheck(
      {
        content: variant.content,
        keyword: experiment.targetKeyword,
        submittedKeywords: experiment.submittedKeywords,
        preferredNodeKey,
      },
      { traceId, jobId: `reverse:${experimentId}:${dto.variantKey}:${dto.round}` },
    );
    if (result.skipped || result.overall <= 0) {
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, 'Semrush 未返回有效分数，请重试');
    }

    const fresh = await this.load(organizationId, projectId);
    const freshIndex = fresh.experiments.findIndex((item) => item.id === experimentId);
    if (freshIndex < 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '反推实验已被删除');
    }
    const freshExperiment = fresh.experiments[freshIndex];
    const freshVariant = toScoreReverseExperimentDto(freshExperiment).variants.find(
      (item) => item.key === dto.variantKey,
    );
    if (!freshVariant || hashScoreReverseContent(freshVariant.content) !== hashScoreReverseContent(variant.content)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '实验内容已变化，本次结果未写入');
    }
    const currentTrials = [...(freshExperiment.trials[dto.variantKey] ?? [])];
    const databaseLabel = this.extractDatabaseLabel(result.nodeLabel);
    const trial = {
      score: Math.round(result.overall * 10) / 10,
      round: dto.round,
      nodeKey: result.node,
      nodeLabel: result.nodeLabel,
      ...(databaseLabel ? { databaseLabel } : {}),
      contentHash: result.semrushCheckRecord?.contentHash ?? hashScoreReverseContent(variant.content),
      keywordSetHash: hashScoreReverseKeywordSet(experiment.submittedKeywords),
      semrushReadabilityScore: result.semrushReadabilityScore,
      semrushCurrentWordCount: result.semrushCurrentWordCount,
      semrushCompetitorWordCount: result.semrushCompetitorWordCount,
      suggestions: result.suggestions,
      suggestionDetails: result.suggestionDetails,
      analysisSource: result.analysisSource,
      checkedAt: result.semrushCheckRecord?.checkedAt ?? new Date().toISOString(),
    };
    const existingIndex = currentTrials.findIndex((item, index) => (item.round ?? index + 1) === dto.round);
    if (existingIndex >= 0) currentTrials[existingIndex] = trial;
    else currentTrials.push(trial);
    currentTrials.sort((left, right) => (left.round ?? 0) - (right.round ?? 0));
    freshExperiment.trials[dto.variantKey] = currentTrials;
    freshExperiment.updatedAt = new Date().toISOString();
    fresh.experiments[freshIndex] = freshExperiment;
    await this.save(projectId, fresh.config, fresh.experiments);
    this.logger.info('Score reverse trial completed by Semrush RPA', {
      traceId,
      organizationId,
      projectId,
      experimentId,
      variantKey: dto.variantKey,
      round: dto.round,
      score: trial.score,
      node: trial.nodeKey,
      action: 'score_reverse.run_trial',
    });
    return toScoreReverseExperimentDto(freshExperiment);
  }

  async analyze(
    organizationId: string,
    projectId: string,
    experimentId: string,
    traceId: string,
  ) {
    const loaded = await this.load(organizationId, projectId);
    const index = loaded.experiments.findIndex((item) => item.id === experimentId);
    if (index < 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '反推实验不存在');
    }
    const experiment = loaded.experiments[index];
    const dto = toScoreReverseExperimentDto(experiment);
    const baseline = dto.variants.find((variant) => variant.key === 'baseline');
    const measuredFactors = dto.variants.filter(
      (variant) => variant.key !== 'baseline' && variant.medianScore !== null,
    );
    if (!baseline || baseline.medianScore === null || measuredFactors.length === 0) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '请先录入基线和至少一个实验变量的检测分数，再让 AI 分析',
      );
    }

    const result = await this.llmProvider.analyzeScoreReverseExperiment({
      experimentName: experiment.name,
      targetKeyword: experiment.targetKeyword,
      submittedKeywords: experiment.submittedKeywords,
      baselineSpread: dto.baselineSpread,
      baselineDriftDetected: dto.baselineDriftDetected,
      variants: dto.variants.map((variant) => ({
        key: variant.key,
        label: variant.label,
        medianScore: variant.medianScore,
        standardDeviation: variant.standardDeviation,
        deltaFromBaseline: variant.deltaFromBaseline,
        pairedDeltaMedian: variant.pairedDeltaMedian,
        pairedDeltaStandardDeviation: variant.pairedDeltaStandardDeviation,
        pairedSampleCount: variant.pairedSampleCount,
        confidence: variant.confidence,
        trialCount: variant.trials.length,
        warnings: variant.warnings,
        observation: experiment.observations?.[variant.key],
      })),
    });
    const basedOnUpdatedAt = experiment.updatedAt;
    const fresh = await this.load(organizationId, projectId);
    const freshIndex = fresh.experiments.findIndex((item) => item.id === experimentId);
    if (freshIndex < 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '反推实验已被删除');
    }
    const freshExperiment = fresh.experiments[freshIndex];
    freshExperiment.aiAnalysis = {
      ...result,
      generatedAt: new Date().toISOString(),
      basedOnUpdatedAt,
    };
    fresh.experiments[freshIndex] = freshExperiment;
    await this.save(projectId, fresh.config, fresh.experiments);
    this.logger.info('Score reverse experiment analyzed by AI', {
      traceId,
      organizationId,
      projectId,
      experimentId,
      findingCount: result.findings.length,
      action: 'score_reverse.ai_analysis',
    });
    return toScoreReverseExperimentDto(freshExperiment);
  }

  async delete(
    organizationId: string,
    projectId: string,
    experimentId: string,
    traceId: string,
  ) {
    const loaded = await this.load(organizationId, projectId);
    const next = loaded.experiments.filter((item) => item.id !== experimentId);
    if (next.length === loaded.experiments.length) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '反推实验不存在');
    }
    await this.save(projectId, loaded.config, next);
    this.logger.info('Score reverse experiment deleted', {
      traceId,
      organizationId,
      projectId,
      experimentId,
      action: 'score_reverse.delete',
    });
    return { experimentId };
  }

  private async load(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { config: true },
    });
    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }
    return {
      config: project.config,
      experiments: readStoredScoreReverseExperiments(project.config),
    };
  }

  private async save(projectId: string, config: unknown, experiments: Parameters<typeof writeStoredScoreReverseExperiments>[1]) {
    await this.prisma.project.update({
      where: { id: projectId },
      data: { config: writeStoredScoreReverseExperiments(config, experiments) as object },
    });
  }

  private extractDatabaseLabel(nodeLabel?: string): string | undefined {
    const match = nodeLabel?.match(/地区数据库\s+(.+?)(?:\s+✅|$)/i);
    return match?.[1]?.trim() || undefined;
  }
}
