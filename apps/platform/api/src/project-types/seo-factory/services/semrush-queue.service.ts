/**
 * Semrush Playwright 查分队列封装：入队 + 等待结果。
 *
 * 边界：
 * - 不负责：RPA 实现（SemrushRpaAdapter）
 *
 * 入口：
 * - SemrushQueueService
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import {
  SEO_CHECKER_PROVIDER,
  type ISeoCheckerProvider,
  type SeoCheckInput,
  type SeoScore,
} from '@wm/provider-interfaces';
import { PLAYWRIGHT_QUEUE } from '../../../core/queue/queue.constants';
import {
  isPlaywrightQueueEnabled,
  readPlaywrightQueueOptions,
} from '../../../core/queue/playwright-queue.config';
import { LoggerService } from '../../../core/logger/logger.service';

export interface SemrushQueueMeta {
  traceId: string;
  jobId: string;
}

export interface PlaywrightJobPayload {
  input: SeoCheckInput;
  traceId: string;
  jobId: string;
}

@Injectable()
export class SemrushQueueService implements OnModuleInit, OnModuleDestroy {
  private queueEvents: QueueEvents | null = null;
  private readonly options = readPlaywrightQueueOptions();

  constructor(
    @InjectQueue(PLAYWRIGHT_QUEUE) private readonly queue: Queue<PlaywrightJobPayload>,
    @Inject(SEO_CHECKER_PROVIDER) private readonly semrushChecker: ISeoCheckerProvider,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isPlaywrightQueueEnabled()) {
      return;
    }
    this.queueEvents = new QueueEvents(PLAYWRIGHT_QUEUE, {
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close();
  }

  async runCheck(input: SeoCheckInput, meta: SemrushQueueMeta): Promise<SeoScore> {
    if (!isPlaywrightQueueEnabled()) {
      return this.semrushChecker.checkScore(input);
    }

    if (!this.queueEvents) {
      throw new Error('Playwright QueueEvents 未初始化');
    }

    const bullJob = await this.queue.add(
      'semrush-check',
      { input, traceId: meta.traceId, jobId: meta.jobId },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.info('Semrush check enqueued to Playwright queue', {
      traceId: meta.traceId,
      jobId: meta.jobId,
      action: 'semrush_queue.enqueue',
      bullJobId: bullJob.id,
    });

    const result = await bullJob.waitUntilFinished(this.queueEvents, this.options.jobTimeoutMs);
    return result as SeoScore;
  }
}
