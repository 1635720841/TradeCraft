/**
 * demo-factory BullMQ 空任务：仅写日志验证队列前缀。
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggerService } from '../../../core/logger/logger.service';
import { DEMO_FACTORY_QUEUE } from '../../../core/queue/queue.constants';

@Processor(DEMO_FACTORY_QUEUE)
export class DemoTickProcessor extends WorkerHost {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.info('demo-factory tick', {
      action: 'demo_factory.tick',
      jobName: job.name,
      jobId: job.id,
    });
  }
}
