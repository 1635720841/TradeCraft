/**
 * 公开健康检查：BullMQ 队列深度汇总。
 */

import type { Queue } from 'bullmq';
import {
  ARTICLE_JOB_QUEUE,
  GSC_SYNC_QUEUE,
  PLAYWRIGHT_QUEUE,
} from '../queue/queue.constants';

export interface PublicQueueJobCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface PublicQueueHealthSummary {
  article: PublicQueueJobCounts;
  playwright: PublicQueueJobCounts;
  gsc: PublicQueueJobCounts;
  waiting: number;
  active: number;
  failed: number;
}

function normalizeJobCounts(counts: { [index: string]: number }): PublicQueueJobCounts {
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

export async function summarizePublicQueueHealth(queues: {
  article: Queue;
  playwright: Queue;
  gsc: Queue;
}): Promise<PublicQueueHealthSummary> {
  const [articleRaw, playwrightRaw, gscRaw] = await Promise.all([
    queues.article.getJobCounts('waiting', 'active', 'failed', 'delayed'),
    queues.playwright.getJobCounts('waiting', 'active', 'failed', 'delayed'),
    queues.gsc.getJobCounts('waiting', 'active', 'failed', 'delayed'),
  ]);
  const article = normalizeJobCounts(articleRaw);
  const playwright = normalizeJobCounts(playwrightRaw);
  const gsc = normalizeJobCounts(gscRaw);

  const waiting = article.waiting + playwright.waiting + gsc.waiting;
  const active = article.active + playwright.active + gsc.active;
  const failed = article.failed + playwright.failed + gsc.failed;

  return {
    article,
    playwright,
    gsc,
    waiting,
    active,
    failed,
  };
}

export function isPublicQueueHealthDegraded(summary: PublicQueueHealthSummary): boolean {
  return summary.failed > 0;
}

export const PUBLIC_QUEUE_NAMES = {
  article: ARTICLE_JOB_QUEUE,
  playwright: PLAYWRIGHT_QUEUE,
  gsc: GSC_SYNC_QUEUE,
} as const;
