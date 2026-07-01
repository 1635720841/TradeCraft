/**
 * 文章任务 BullMQ 入队与队列清理。
 *
 * 边界：
 * - 不负责：任务 CRUD（ArticleJobService）、工作流执行（Processor）
 *
 * 入口：
 * - ArticleJobQueueService
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../../core/logger/logger.service';
import { ARTICLE_JOB_QUEUE, PLAYWRIGHT_QUEUE } from '../../../../core/queue/queue.constants';
import { OrgQueueLimiterService } from '../../../../core/queue/org-queue-limiter.service';
import type { ArticleJobQueuePayload } from '../../processors/article-job.processor';
import { removeBullJobsByArticleJobId } from '../../utils/article-job-queue-cleanup.util';
import type { PlaywrightJobPayload } from '../../services/semrush-queue.service';

@Injectable()
export class ArticleJobQueueService {
  constructor(
    private readonly logger: LoggerService,
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleJobQueue: Queue<ArticleJobQueuePayload>,
    @InjectQueue(PLAYWRIGHT_QUEUE) private readonly playwrightQueue: Queue<PlaywrightJobPayload>,
    private readonly orgQueueLimiter: OrgQueueLimiterService,
  ) {}

  async enqueueArticleJob(
    payload: ArticleJobQueuePayload,
    bullJobId: string,
  ): Promise<void> {
    await this.orgQueueLimiter.assertCanEnqueue(payload.organizationId);
    try {
      await this.articleJobQueue.add('generate', payload, { jobId: bullJobId, attempts: 3 });
    } catch (error) {
      await this.orgQueueLimiter.rollbackRateSlot(payload.organizationId);
      throw error;
    }
  }

  async removeQueueJobsForArticleJob(
    job: { id: string; traceId: string },
    organizationId: string,
    projectId: string,
  ): Promise<{ articleQueueRemoved: number; playwrightQueueRemoved: number }> {
    const [articleQueueRemoved, playwrightQueueRemoved] = await Promise.all([
      removeBullJobsByArticleJobId(this.articleJobQueue, job.id),
      removeBullJobsByArticleJobId(this.playwrightQueue, job.id),
    ]);

    if (articleQueueRemoved > 0 || playwrightQueueRemoved > 0) {
      this.logger.info('Removed pending queue jobs before article job delete', {
        traceId: job.traceId,
        organizationId,
        projectId,
        jobId: job.id,
        action: 'article_job.delete_queue_cleanup',
        articleQueueRemoved,
        playwrightQueueRemoved,
      });
    }

    return { articleQueueRemoved, playwrightQueueRemoved };
  }
}
