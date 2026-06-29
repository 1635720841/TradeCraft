/**
 * 审核超时升级调度：每日扫描超过 24 小时未确认的大纲。
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { REVIEW_ESCALATION_QUEUE } from '../../core/queue/queue.constants';
import { LoggerService } from '../../core/logger/logger.service';

const REVIEW_ESCALATION_JOB_ID = 'platform-review-escalation-daily';

@Injectable()
export class ReviewEscalationScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(REVIEW_ESCALATION_QUEUE) private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.REVIEW_ESCALATION_ENABLED === 'false') {
      return;
    }

    await this.queue.add(
      'scan-stale-briefs',
      {},
      {
        jobId: REVIEW_ESCALATION_JOB_ID,
        repeat: { pattern: '0 9 * * *' },
      },
    );

    this.logger.info('Review escalation daily scan scheduled', {
      action: 'review_escalation.schedule',
      pattern: '0 9 * * *',
    });
  }
}
