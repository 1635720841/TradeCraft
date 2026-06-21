/**
 * 文章内容评分服务：Semrush SWA 式即时评分（改稿主入口）。
 *
 * 边界：
 * - 不负责：Semrush RPA（ISeoCheckerProvider）
 * - 不负责：工作流状态机（WorkflowService）
 *
 * 入口：
 * - ArticleScoreService
 */

import { Injectable } from '@nestjs/common';
import { resolveArticleScoreKeywordList } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { ScoreCalibrationService } from '../score-calibration/score-calibration.service';
import { buildContentScoreSnapshot } from '../../utils/article-content-score-snapshot.util';
import {
  extractBriefRecommendedKeywords,
  extractSerpOrganic,
  extractSemrushHintsFromJob,
  extractTargetWordCount,
  resolveSubmittedKeywords,
  scoreArticleContent,
} from '../../utils/article-content-score.util';
import type { ScoreArticleContentDto } from './dto/score-article-content.dto';
import type { ScoreArticleContentTrialDto } from './dto/score-article-content-trial.dto';

@Injectable()
export class ArticleScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly scoreCalibrationService: ScoreCalibrationService,
  ) {}

  async scoreJobContent(
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: ScoreArticleContentDto,
    traceId: string,
  ) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        targetKeyword: true,
        briefData: true,
        seoCheckData: true,
        serpData: true,
      },
    });
    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const content = dto.content.trim();
    if (content.length < 80) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文过短，至少 80 字符后再评分');
    }

    const result = await this.scoreContent({
      targetKeyword: job.targetKeyword,
      content,
      briefData: job.briefData,
      serpData: job.serpData,
      seoCheckData: job.seoCheckData,
      submittedKeywords: dto.submittedKeywords,
      competitorWordCount: dto.competitorWordCount,
      organizationId,
      projectId,
    });

    const snapshot = buildContentScoreSnapshot(result, {
      content,
      source: 'draft_editor',
    });
    const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        seoCheckData: {
          ...prevCheck,
          contentScore: snapshot,
        } as object,
      },
    });

    this.logger.info('Article content scored', {
      traceId,
      organizationId,
      projectId,
      jobId,
      overall: result.overall,
      passed: result.passed,
      confidence: result.confidence,
      action: 'article_score.score',
    });

    return {
      jobId: job.id,
      targetKeyword: job.targetKeyword,
      contentScore: snapshot,
      ...result,
    };
  }

  async scoreTrialContent(
    organizationId: string,
    projectId: string,
    dto: ScoreArticleContentTrialDto,
    traceId: string,
  ) {
    const content = dto.content.trim();
    if (content.length < 80) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文过短，至少 80 字符后再评分');
    }

    const result = await this.scoreContent({
      targetKeyword: dto.targetKeyword.trim(),
      content,
      submittedKeywords: dto.submittedKeywords,
      targetWordCount: dto.targetWordCount,
      competitorWordCount: dto.competitorWordCount,
      organizationId,
      projectId,
    });

    this.logger.info('Article content trial scored', {
      traceId,
      organizationId,
      projectId,
      overall: result.overall,
      passed: result.passed,
      confidence: result.confidence,
      action: 'article_score.trial',
    });

    return {
      targetKeyword: dto.targetKeyword.trim(),
      ...result,
    };
  }

  private async scoreContent(input: {
    targetKeyword: string;
    content: string;
    briefData?: unknown;
    serpData?: unknown;
    seoCheckData?: unknown;
    submittedKeywords?: string[];
    targetWordCount?: number;
    competitorWordCount?: number;
    organizationId: string;
    projectId: string;
  }) {
    const semrushHints = extractSemrushHintsFromJob(input.seoCheckData);
    const parsedKeywords = resolveArticleScoreKeywordList({
      targetKeyword: input.targetKeyword,
      submittedKeywords: input.submittedKeywords,
    });
    const submittedKeywords = resolveSubmittedKeywords({
      targetKeyword: parsedKeywords.primaryKeyword,
      submittedKeywords: parsedKeywords.keywordList,
      briefRecommended: extractBriefRecommendedKeywords(input.briefData),
      semrushSubmitted: semrushHints.submittedKeywords,
      semrushRecommended: semrushHints.semrushRecommended,
    });
    const { primaryKeyword, keywordList } = resolveArticleScoreKeywordList({
      targetKeyword: parsedKeywords.primaryKeyword,
      submittedKeywords,
    });
    const { model, featureMeans } = await this.scoreCalibrationService.loadProjectCalibration(
      input.organizationId,
      input.projectId,
    );

    return scoreArticleContent({
      targetKeyword: primaryKeyword,
      content: input.content,
      submittedKeywords: keywordList,
      serpOrganic: extractSerpOrganic(input.serpData),
      targetWordCount: input.targetWordCount ?? extractTargetWordCount(input.briefData),
      competitorWordCount: input.competitorWordCount ?? semrushHints.competitorWordCount,
      priorSemrushNode: semrushHints.priorSemrushNode,
      model,
      featureMeans,
    });
  }
}