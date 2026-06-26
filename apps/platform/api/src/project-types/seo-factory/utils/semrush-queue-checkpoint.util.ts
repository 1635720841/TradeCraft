/**
 * Semrush 队列 RPA 结果 checkpoint：每次查分成功即落库，Worker 晚完成时兜底写入。
 *
 * 边界：
 * - 不负责：LLM 优化轮次、工作流状态机
 *
 * 入口：
 * - shouldPersistSemrushQueueCheckpoint / persistSemrushQueueCheckpoint
 */

import type { SeoScore } from '@wm/provider-interfaces';
import { PrismaService } from '../../../core/database/prisma.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { SEMRUSH_PASS_THRESHOLD } from '../constants/seo-score';
import { hashSemrushContent } from '../providers/semrush/semrush-content-hash.util';
import { buildSemrushSubmittedKeywords, filterSemrushSubmittedKeywordsInContent } from '../providers/semrush/semrush-submitted-keywords.util';

const LATE_RECOVERY_ERROR_PATTERN = /timed out before finishing|Job wait|超时/i;

function getRpaInFlightContentHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const contentHash = (value as { contentHash?: unknown }).contentHash;
  return typeof contentHash === 'string' && contentHash.length > 0
    ? contentHash
    : undefined;
}

export function shouldPersistSemrushQueueCheckpoint(input: {
  status: string;
  seoCheckData: unknown;
  errorMessage?: string | null;
}): boolean {
  const data = (input.seoCheckData ?? {}) as {
    semrush?: {
      cancelled?: boolean;
      pending?: unknown;
      rpaInFlight?: unknown;
      lastManualCheckError?: string;
    };
  };

  if (data.semrush?.cancelled) {
    return false;
  }
  if (input.status === 'OPTIMIZING') {
    return true;
  }
  if (data.semrush?.pending) {
    return true;
  }
  if (data.semrush?.rpaInFlight) {
    return true;
  }

  const lastError = [data.semrush?.lastManualCheckError, input.errorMessage]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
  return LATE_RECOVERY_ERROR_PATTERN.test(lastError);
}

function resolveSubmittedKeywords(
  content: string,
  targetKeyword: string,
  semrushResult: SeoScore,
): string[] {
  const raw =
    semrushResult.semrushTargetKeywords && semrushResult.semrushTargetKeywords.length > 0
      ? semrushResult.semrushTargetKeywords
      : buildSemrushSubmittedKeywords(content, {
          targetKeyword,
          poolKeywords: semrushResult.semrushRecommendedKeywords ?? [],
        });
  return filterSemrushSubmittedKeywordsInContent(content, raw);
}

/** RPA 查分成功后写入 DB；返回是否实际更新 */
export async function persistSemrushQueueCheckpoint(
  prisma: PrismaService,
  articleJobId: string,
  semrushResult: SeoScore,
  checkedContent: string,
  logger?: LoggerService,
): Promise<boolean> {
  if (semrushResult.skipped || semrushResult.overall <= 0) {
    return false;
  }

  const job = await prisma.articleJob.findUnique({
    where: { id: articleJobId },
    select: {
      id: true,
      status: true,
      targetKeyword: true,
      seoCheckData: true,
      errorMessage: true,
    },
  });

  if (!job || !shouldPersistSemrushQueueCheckpoint(job)) {
    return false;
  }

  const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
  const prevSemrush = (prevCheck.semrush ?? {}) as Record<string, unknown>;
  const checkedContentHash = hashSemrushContent(checkedContent);
  const resultContentHash = semrushResult.semrushCheckRecord?.contentHash;
  if (resultContentHash && resultContentHash !== checkedContentHash) {
    logger?.warn('Semrush RPA checkpoint skipped for mismatched result hash', {
      jobId: articleJobId,
      action: 'semrush_queue.checkpoint_hash_mismatch',
      resultContentHash,
      checkedContentHash,
    });
    return false;
  }

  const inFlightContentHash = getRpaInFlightContentHash(prevSemrush.rpaInFlight);
  if (inFlightContentHash && inFlightContentHash !== checkedContentHash) {
    logger?.warn('Semrush RPA checkpoint skipped for stale in-flight hash', {
      jobId: articleJobId,
      action: 'semrush_queue.checkpoint_stale_inflight',
      inFlightContentHash,
      checkedContentHash,
    });
    return false;
  }

  const {
    pending,
    rpaInFlight: _rpaInFlight,
    manualCheckPreviousStatus: _manualPrev,
    lastManualCheckError,
    ...semrushRest
  } = prevSemrush;

  const lateRecoveryError = [lastManualCheckError, job.errorMessage]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
  const wasLateRecovery = LATE_RECOVERY_ERROR_PATTERN.test(lateRecoveryError);
  const submittedKeywords = resolveSubmittedKeywords(
    checkedContent,
    job.targetKeyword,
    semrushResult,
  );
  const now = new Date().toISOString();

  await prisma.articleJob.update({
    where: { id: articleJobId },
    data: {
      semrushScore: semrushResult.overall,
      errorMessage: wasLateRecovery ? null : job.errorMessage,
      seoCheckData: {
        ...prevCheck,
        semrush: {
          ...semrushRest,
          ...(pending ? { pending } : {}),
          overall: semrushResult.overall,
          suggestions: semrushResult.suggestions,
          passed: semrushResult.overall >= SEMRUSH_PASS_THRESHOLD,
          node: semrushResult.node,
          nodeLabel: semrushResult.nodeLabel,
          suggestionDetails: semrushResult.suggestionDetails,
          actionableIssues: semrushResult.actionableIssues,
          analysisSource: semrushResult.analysisSource,
          apiUrls: semrushResult.apiUrls,
          submittedKeywords,
          semrushCompetitorWordCount: semrushResult.semrushCompetitorWordCount,
          semrushCurrentWordCount: semrushResult.semrushCurrentWordCount,
          semrushReadabilityScore: semrushResult.semrushReadabilityScore,
          semrushEvaluationRoute: semrushResult.semrushEvaluationRoute,
          semrushEvaluationContentFingerprint:
            semrushResult.semrushEvaluationContentFingerprint,
          semrushTargetKeywords: semrushResult.semrushTargetKeywords,
          semrushRecommendedKeywords: semrushResult.semrushRecommendedKeywords,
          semrushMissingTargetKeywords: semrushResult.semrushMissingTargetKeywords,
          semrushMissingRecommendedKeywords: semrushResult.semrushMissingRecommendedKeywords,
          keywordCoverage: semrushResult.keywordCoverage,
          semrushCheckRecord: semrushResult.semrushCheckRecord,
          lastRpaCheckpointAt: now,
          ...(wasLateRecovery
            ? {
                lastManualCheckError: undefined,
                lateQueueRecoveryAt: now,
              }
            : {}),
        },
      } as object,
    },
  });

  logger?.info('Semrush RPA checkpoint persisted', {
    jobId: articleJobId,
    action: wasLateRecovery
      ? 'semrush_queue.checkpoint_late_recovery'
      : 'semrush_queue.checkpoint',
    semrushScore: semrushResult.overall,
    lateRecovery: wasLateRecovery,
  });

  return true;
}
