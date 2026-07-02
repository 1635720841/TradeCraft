/**
 * demo-factory 项目创建后：种子数据 + 入队 tick。
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import {
  PROJECT_CREATED_EVENT,
  type ProjectCreatedPayload,
} from '../../../core/event-bus/events';
import { runAfterCommit } from '../../../core/event-bus/run-after-commit';
import { DEMO_FACTORY_QUEUE } from '../../../core/queue/queue.constants';
import { DemoItemService } from '../modules/demo-item/demo-item.service';

@Injectable()
export class DemoProjectCreatedListener {
  constructor(
    private readonly demoItemService: DemoItemService,
    @InjectQueue(DEMO_FACTORY_QUEUE) private readonly demoQueue: Queue,
  ) {}

  @OnEvent(PROJECT_CREATED_EVENT)
  onProjectCreated(payload: ProjectCreatedPayload): void {
    if (payload.projectType !== 'demo-factory') return;
    runAfterCommit(() => this.bootstrapDemoProject(payload));
  }

  private async bootstrapDemoProject(payload: ProjectCreatedPayload): Promise<void> {
    await this.demoItemService.ensureSeed(payload.organizationId, payload.projectId);
    await this.demoQueue.add(
      'tick',
      {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
      },
      { removeOnComplete: 100, removeOnFail: 50 },
    );
  }
}
