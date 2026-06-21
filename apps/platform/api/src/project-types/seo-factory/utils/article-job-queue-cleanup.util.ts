/**
 * 文章任务队列清理：按 ArticleJob.id 移除 BullMQ 中待执行的关联任务。
 *
 * 边界：
 * - 不负责：正在 active 的执行中断（删除 DB 后 worker 自行失败）
 */

import type { Queue } from 'bullmq';

const REMOVABLE_STATES = ['waiting', 'delayed', 'paused', 'prioritized'] as const;

/** 移除队列中 payload.jobId 匹配的待执行任务 */
export async function removeBullJobsByArticleJobId(
  queue: Queue,
  articleJobId: string,
): Promise<number> {
  let removed = 0;

  for (const state of REMOVABLE_STATES) {
    const jobs = await queue.getJobs(state, 0, 500);
    for (const job of jobs) {
      const payload = job.data as { jobId?: string } | undefined;
      if (payload?.jobId !== articleJobId) {
        continue;
      }
      await job.remove();
      removed += 1;
    }
  }

  return removed;
}
