/**
 * Playwright / Semrush RPA 专用 BullMQ Processor：串行 + 限速。
 *
 * 边界：
 * - 不负责：本地 SEO 评分（SeoCheckerService）
 *
 * 入口：
 * - PlaywrightJobProcessor
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  SEO_CHECKER_PROVIDER,
  type ISeoCheckerProvider,
  type SeoScore,
} from '@wm/provider-interfaces';
import { PLAYWRIGHT_QUEUE } from '../../../core/queue/queue.constants';
import { readPlaywrightQueueOptions } from '../../../core/queue/playwright-queue.config';
import type { PlaywrightJobPayload } from '../services/semrush-queue.service';

const queueOptions = readPlaywrightQueueOptions();

@Processor(PLAYWRIGHT_QUEUE, {
  concurrency: queueOptions.concurrency,
  limiter: queueOptions.limiter,
})
export class PlaywrightJobProcessor extends WorkerHost {
  constructor(
    @Inject(SEO_CHECKER_PROVIDER) private readonly semrushChecker: ISeoCheckerProvider,
  ) {
    super();
  }

  async process(job: Job<PlaywrightJobPayload>): Promise<SeoScore> {
    return this.semrushChecker.checkScore(job.data.input);
  }
}
