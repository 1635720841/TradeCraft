/**
 * demo-factory 模块启动时入队一次 tick（验证队列连通性）。
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DEMO_FACTORY_QUEUE } from '../../../core/queue/queue.constants';

@Injectable()
export class DemoTickBootstrapService implements OnModuleInit {
  constructor(@InjectQueue(DEMO_FACTORY_QUEUE) private readonly demoQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.demoQueue.add(
      'bootstrap-tick',
      { source: 'module-init' },
      { removeOnComplete: true, removeOnFail: true },
    );
  }
}
