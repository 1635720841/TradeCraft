/**
 * 自动生产定时调度：每小时检查到期站点并入队。
 *
 * 边界：
 * - 不负责：选词与入队逻辑（AutopilotService）
 *
 * 入口：
 * - AutopilotScheduler
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AUTOPILOT_QUEUE } from '../../../../core/queue/queue.constants';
import { LoggerService } from '../../../../core/logger/logger.service';

const AUTOPILOT_TICK_JOB_ID = 'seo-factory-autopilot-hourly-tick';

@Injectable()
export class AutopilotScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(AUTOPILOT_QUEUE) private readonly autopilotQueue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.AUTOPILOT_SCHEDULER_ENABLED !== 'true') {
      return;
    }

    await this.autopilotQueue.add(
      'tick',
      {},
      {
        jobId: AUTOPILOT_TICK_JOB_ID,
        repeat: { pattern: '0 * * * *' },
      },
    );

    this.logger.info('Autopilot hourly tick scheduled', {
      action: 'autopilot.schedule',
      pattern: '0 * * * *',
    });
  }
}
