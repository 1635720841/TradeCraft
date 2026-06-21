/**
 * Playwright 队列等待：主超时 + grace 宽限，避免 RPA 仍在跑时等待方先放弃。
 *
 * 边界：
 * - 不负责：入队、RPA 实现
 *
 * 入口：
 * - waitForPlaywrightJobResult / isPlaywrightJobWaitTimeout
 */

import { type Job, type Queue, type QueueEvents } from 'bullmq';

export interface PlaywrightJobWaitOptions {
  primaryTimeoutMs: number;
  graceTimeoutMs: number;
}

export function isPlaywrightJobWaitTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timed out before finishing|no finish notification arrived/i.test(error.message);
}

/** BullMQ waitUntilFinished 超时后，若 Worker 仍在跑则 grace 续等；边界竞态再读 returnvalue */
export async function waitForPlaywrightJobResult(
  bullJob: Job,
  queue: Queue,
  queueEvents: QueueEvents,
  options: PlaywrightJobWaitOptions,
  logGrace?: (meta: Record<string, unknown>) => void,
): Promise<unknown> {
  try {
    return await bullJob.waitUntilFinished(queueEvents, options.primaryTimeoutMs);
  } catch (error) {
    if (!isPlaywrightJobWaitTimeout(error)) {
      throw error;
    }

    const state = await bullJob.getState();
    if (state === 'completed') {
      const completed = await queue.getJob(bullJob.id!);
      return completed?.returnvalue;
    }

    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      logGrace?.({
        bullJobId: bullJob.id,
        state,
        graceTimeoutMs: options.graceTimeoutMs,
      });
      try {
        return await bullJob.waitUntilFinished(queueEvents, options.graceTimeoutMs);
      } catch (graceError) {
        const lateState = await bullJob.getState();
        if (lateState === 'completed') {
          const completed = await queue.getJob(bullJob.id!);
          return completed?.returnvalue;
        }
        throw graceError;
      }
    }

    throw error;
  }
}
