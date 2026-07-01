/** 工作流步骤：SERP → Brief → 初稿 → 内链 → 配图 → Semrush 优化 → QuillBot → YMYL 审查 */
import type { JobStatus } from '@prisma/client';
import { WORKFLOW_STEPS, type WorkflowStep } from '@wm/shared-core';
import { countEffectiveMarkdownImages } from '../modules/illustration/article-image.util';
import { SEMRUSH_PASS_THRESHOLD } from './seo-score';
import { SWA_MIN_IMAGES } from './swa-content';

export { WORKFLOW_STEPS };
export type WorkflowResumeStep = WorkflowStep;

export interface WorkflowMeta {
  failedStep?: WorkflowResumeStep;
  pausedStep?: WorkflowResumeStep;
  pausedAt?: string;
  pausedBy?: string;
  pauseReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}

/** 从断点步骤映射任务状态（恢复续跑时避免长时间显示 QUEUED）。 */
export function jobStatusForResumeStep(step: WorkflowResumeStep): JobStatus {
  switch (step) {
    case 'serp':
      return 'QUEUED';
    case 'brief':
    case 'draft':
      return 'DRAFTING';
    case 'linking':
      return 'LINKING';
    case 'images':
      return 'ILLUSTRATING';
    case 'optimizing':
    case 'paraphrasing':
      return 'OPTIMIZING';
    case 'ymyl':
      return 'REVIEWING';
    default:
      return 'QUEUED';
  }
}

export function getWorkflowMeta(seoCheckData: unknown): WorkflowMeta {
  const data = (seoCheckData ?? {}) as { workflow?: WorkflowMeta };
  return data.workflow ?? {};
}

/** 写入或清除 workflow 元数据（存于 seoCheckData.workflow，避免改表） */
export function withWorkflowMeta(
  seoCheckData: unknown,
  workflow: WorkflowMeta | null,
): Record<string, unknown> {
  const base = { ...((seoCheckData ?? {}) as Record<string, unknown>) };
  if (
    !workflow?.failedStep &&
    !workflow?.pausedStep &&
    !workflow?.pausedAt &&
    !workflow?.pausedBy &&
    !workflow?.pauseReason
  ) {
    delete base.workflow;
    return base;
  }
  return { ...base, workflow };
}

/** 失败时根据当前状态与已有数据判断应从哪一步重试 */
export function resolveFailedStep(job: {
  status: string;
  briefData: unknown;
  draftData: unknown;
  seoCheckData?: unknown;
  semrushScore?: number | null;
}): WorkflowResumeStep {
  if (job.status === 'RESEARCHING') return 'serp';
  if (job.status === 'LINKING') return 'linking';
  if (job.status === 'ILLUSTRATING') return 'images';
  if (job.status === 'OPTIMIZING') {
    if (
      !isSemrushOptimizationIncomplete(job.seoCheckData, job.semrushScore) &&
      !isParaphraseCompleted(job.draftData, job.seoCheckData)
    ) {
      return 'paraphrasing';
    }
    return 'optimizing';
  }
  if (job.status === 'REVIEWING') return 'ymyl';
  if (job.status === 'DRAFTING') {
    const brief = job.briefData as { outline?: unknown } | null;
    if (brief?.outline) return 'draft';
    return 'brief';
  }
  return 'serp';
}

/** 重试时解析续跑起点：优先用失败时记录，否则按已有数据推断 */
export function resolveResumeStep(job: {
  serpData: unknown;
  briefData: unknown;
  draftData: unknown;
  seoCheckData: unknown;
  semrushScore?: number | null;
}): WorkflowResumeStep {
  const meta = getWorkflowMeta(job.seoCheckData);
  if (meta.failedStep) return meta.failedStep;
  return inferResumeStepFromData(job);
}

function inferResumeStepFromData(job: {
  serpData: unknown;
  briefData: unknown;
  draftData: unknown;
  seoCheckData: unknown;
  semrushScore?: number | null;
}): WorkflowResumeStep {
  const draft = job.draftData as {
    content?: string;
    internalLinksApplied?: boolean;
    imagesApplied?: boolean;
    paraphraseApplied?: boolean;
  } | null;

  if (draft?.content?.trim()) {
    if (!draft.internalLinksApplied) return 'linking';
    const imageCount = countEffectiveMarkdownImages(draft.content);
    if (!draft.imagesApplied || imageCount < SWA_MIN_IMAGES) return 'images';
    if (isSemrushOptimizationIncomplete(job.seoCheckData, job.semrushScore)) return 'optimizing';
    if (!isParaphraseCompleted(job.draftData, job.seoCheckData)) return 'paraphrasing';
    if (!isYmylReviewCompleted(job.seoCheckData)) return 'ymyl';
    return 'ymyl';
  }

  const brief = job.briefData as { outline?: unknown } | null;
  if (brief?.outline) return 'draft';

  const serp = job.serpData as Record<string, unknown> | null;
  if (serp && Object.keys(serp).length > 0) return 'brief';

  return 'serp';
}

function isSemrushOptimizationIncomplete(seoCheckData: unknown, semrushScore?: number | null): boolean {
  if (semrushScore == null) return true;
  const semrush = (seoCheckData as { semrush?: { passed?: boolean; skipped?: boolean } } | null)
    ?.semrush;
  if (semrush?.skipped) return false;
  if (semrush?.passed === true) return false;
  return semrushScore < SEMRUSH_PASS_THRESHOLD;
}

function isParaphraseCompleted(draftData: unknown, seoCheckData: unknown): boolean {
  const draft = draftData as { paraphraseApplied?: boolean } | null;
  if (draft?.paraphraseApplied) return true;

  const quillbot = (seoCheckData as { quillbot?: { completedAt?: string; skipped?: boolean } } | null)
    ?.quillbot;
  if (quillbot?.skipped) return true;
  return Boolean(quillbot?.completedAt);
}

function isYmylReviewCompleted(seoCheckData: unknown): boolean {
  const record = (seoCheckData ?? {}) as { ymylReview?: { reviewedAt?: string } };
  return Boolean(record.ymylReview?.reviewedAt);
}
