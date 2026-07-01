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
import { BusinessException } from '../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../core/exceptions/error-codes';
import { PrismaService } from '../../../core/database/prisma.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { readPlaywrightQueueOptions } from '../../../core/queue/playwright-queue.config';
import { persistSemrushQueueCheckpoint } from '../utils/semrush-queue-checkpoint.util';
import type { PlaywrightJobPayload } from '../services/semrush-queue.service';

const queueOptions = readPlaywrightQueueOptions();

@Processor(PLAYWRIGHT_QUEUE, {
  concurrency: queueOptions.concurrency,
  limiter: queueOptions.limiter,
})
export class PlaywrightJobProcessor extends WorkerHost {
  constructor(
    @Inject(SEO_CHECKER_PROVIDER) private readonly semrushChecker: ISeoCheckerProvider,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<PlaywrightJobPayload>): Promise<SeoScore> {
    const paused = await this.isArticleJobPaused(job.data.jobId);
    if (paused) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '任务已暂停，Semrush 检测已取消', {
        semrushAborted: true,
      });
    }

    const result = await this.semrushChecker.checkScore({
      ...job.data.input,
      articleJobId: job.data.jobId,
    });
    await persistSemrushQueueCheckpoint(
      this.prisma,
      job.data.jobId,
      result,
      job.data.input.content,
      this.logger,
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Semrush queue checkpoint persist failed', {
        traceId: job.data.traceId,
        jobId: job.data.jobId,
        action: 'semrush_queue.checkpoint_failed',
        bullJobId: job.id,
        error: message,
      });
    });
    return result;
  }

  private async isArticleJobPaused(articleJobId: string): Promise<boolean> {
    const row = await this.prisma.articleJob.findFirst({
      where: { id: articleJobId },
      select: { status: true },
    });
    return String(row?.status ?? '') === 'PAUSED';
  }
}
