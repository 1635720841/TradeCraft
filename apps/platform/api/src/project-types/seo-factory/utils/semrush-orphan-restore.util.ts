/**
 * OPTIMIZING 僵死恢复：区分手动 Semrush 终检中断 vs 工作流优化中断，避免误标「已完成」。
 */

import type { JobStatus } from '@prisma/client';
import { SEMRUSH_PASS_THRESHOLD } from '../constants/seo-score';
import type { SemrushCheckPending } from '../constants/semrush-check';
import {
  resolveFailedStep,
  type WorkflowResumeStep,
} from '../constants/workflow-resume';

export interface OrphanOptimizingRestorePlan {
  status: JobStatus;
  /** 写入 job.errorMessage；手动终检中断不写（仅 semrush.lastManualCheckError） */
  jobErrorMessage: string | null;
  failedStep?: WorkflowResumeStep;
  /** 文章主流程已完成，仅 Semrush 手动检测被中断 */
  manualSemrushInterrupted: boolean;
}

function isArticlePipelineComplete(draftData: unknown): boolean {
  const draft = draftData as {
    content?: string;
    internalLinksApplied?: boolean;
    imagesApplied?: boolean;
  } | null;
  return Boolean(
    draft?.content?.trim() && draft.internalLinksApplied && draft.imagesApplied,
  );
}

/** 推断 OPTIMIZING 僵死时应恢复的状态 */
export function resolveOrphanOptimizingRestore(job: {
  seoCheckData: unknown;
  semrushScore: number | null;
  draftData: unknown;
  briefData?: unknown;
}): OrphanOptimizingRestorePlan {
  const prevCheck = (job.seoCheckData ?? {}) as Record<string, unknown>;
  const prevSemrush = (prevCheck.semrush ?? {}) as {
    pending?: SemrushCheckPending;
    manualCheckPreviousStatus?: JobStatus;
    passed?: boolean;
    recoveredOrphanOptimizing?: boolean;
  };

  const manualPrevious =
    prevSemrush.manualCheckPreviousStatus ?? prevSemrush.pending?.previousStatus;

  if (manualPrevious && manualPrevious !== 'OPTIMIZING') {
    return {
      status: manualPrevious as JobStatus,
      jobErrorMessage: null,
      manualSemrushInterrupted: true,
    };
  }

  const workflowProgress = prevCheck.workflowProgress as { phase?: string } | undefined;
  const semrushPhaseActive =
    workflowProgress?.phase === 'semrush-check' || workflowProgress?.phase === 'semrush';

  const pipelineComplete = isArticlePipelineComplete(job.draftData);
  const semrushCheckIncomplete =
    prevSemrush.passed !== true &&
    (job.semrushScore == null || job.semrushScore < SEMRUSH_PASS_THRESHOLD);

  if (pipelineComplete && semrushPhaseActive && semrushCheckIncomplete) {
    return {
      status: 'COMPLETED',
      jobErrorMessage: null,
      manualSemrushInterrupted: true,
    };
  }

  const failedStep = resolveFailedStep({
    status: 'OPTIMIZING',
    briefData: job.briefData ?? {},
    draftData: job.draftData,
    seoCheckData: job.seoCheckData,
    semrushScore: job.semrushScore,
  });

  return {
    status: 'FAILED',
    jobErrorMessage: null,
    failedStep,
    manualSemrushInterrupted: false,
  };
}
