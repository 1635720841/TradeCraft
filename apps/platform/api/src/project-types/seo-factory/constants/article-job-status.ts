/**
 * 文章任务 JobStatus 语义常量（单一真相源）。
 */

import { JobStatus } from '@prisma/client';

/** 流水线进行中：可暂停、不可删改敏感资源 */
export const BUSY_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.QUEUED,
  JobStatus.RESEARCHING,
  JobStatus.DRAFTING,
  JobStatus.LINKING,
  JobStatus.ILLUSTRATING,
  JobStatus.OPTIMIZING,
  JobStatus.REVIEWING,
] as const;

/** 配图/内链等人工编辑阻塞状态（PAUSED / COMPLETED 可编辑） */
export const IMAGE_MUTATION_BLOCKED_STATUSES: readonly JobStatus[] = [
  JobStatus.QUEUED,
  JobStatus.RESEARCHING,
  JobStatus.DRAFTING,
  JobStatus.LINKING,
  JobStatus.ILLUSTRATING,
  JobStatus.OPTIMIZING,
] as const;

/** 统计「活跃任务」白名单（不含 PAUSED / CANCELLED） */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [...BUSY_JOB_STATUSES];

/** 可取消（终止流水线、保留任务记录） */
export const CANCELLABLE_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.QUEUED,
  JobStatus.PAUSED,
  ...BUSY_JOB_STATUSES,
] as const;

export const JOB_STATUS_CANCELLED = JobStatus.CANCELLED;

export function isBusyJobStatus(status: string): boolean {
  return (BUSY_JOB_STATUSES as readonly string[]).includes(status);
}

export function isImageMutationBlocked(status: string): boolean {
  return (IMAGE_MUTATION_BLOCKED_STATUSES as readonly string[]).includes(status);
}

export function isCancellableJobStatus(status: string): boolean {
  return (CANCELLABLE_JOB_STATUSES as readonly string[]).includes(status);
}
