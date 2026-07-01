/**
 * 自动生产处理器：执行每小时 tick。
 *
 * 边界：
 * - 不负责：Cron 注册（AutopilotScheduler）
 *
 * 入口：
 * - AutopilotProcessor
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AUTOPILOT_QUEUE } from '../../../core/queue/queue.constants';
import { AutopilotService } from '../modules/autopilot/autopilot.service';

@Processor(AUTOPILOT_QUEUE)
export class AutopilotProcessor extends WorkerHost {
  constructor(private readonly autopilotService: AutopilotService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'tick') {
      await this.autopilotService.runDueSites();
    }
  }
}
