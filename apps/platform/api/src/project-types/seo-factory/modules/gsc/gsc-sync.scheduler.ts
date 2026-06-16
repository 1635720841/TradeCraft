/**
 * GSC 定时同步调度：每日拉取过期 Search Console 数据。
 *
 * 边界：
 * - 不负责：单站点手动同步（GscController.sync）
 *
 * 入口：
 * - GscSyncScheduler
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GSC_SYNC_QUEUE } from '../../../../core/queue/queue.constants';
import { LoggerService } from '../../../../core/logger/logger.service';
import { GscService } from './gsc.service';

const GSC_SYNC_JOB_ID = 'seo-factory-gsc-sync-stale-daily';

@Injectable()
export class GscSyncScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(GSC_SYNC_QUEUE) private readonly gscSyncQueue: Queue,
    private readonly gscService: GscService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.GSC_AUTO_SYNC_ENABLED !== 'true') {
      return;
    }

    if (!this.gscService.isConfigured()) {
      this.logger.info('GSC auto sync skipped: OAuth not configured', {
        action: 'gsc.sync.schedule',
      });
      return;
    }

    await this.gscSyncQueue.add(
      'sync-stale',
      {},
      {
        jobId: GSC_SYNC_JOB_ID,
        repeat: { pattern: '0 4 * * *' },
      },
    );

    this.logger.info('GSC daily stale sync scheduled', {
      action: 'gsc.sync.schedule',
      pattern: '0 4 * * *',
    });
  }
}
