/**
 * GSC 定时同步处理器：拉取所有过期/未同步的 Search Console 数据。
 *
 * 边界：
 * - 不负责：OAuth 连接（GscService.handleOAuthCallback）
 *
 * 入口：
 * - GscSyncProcessor
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GSC_SYNC_QUEUE } from '../../../core/queue/queue.constants';
import { GscService } from '../modules/gsc/gsc.service';

@Processor(GSC_SYNC_QUEUE)
export class GscSyncProcessor extends WorkerHost {
  constructor(private readonly gscService: GscService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'sync-stale') {
      await this.gscService.syncAllStaleConnections();
    }
  }
}
