/**
 * Console 运维健康：队列深度与 Provider 状态。
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ARTICLE_JOB_QUEUE,
  GSC_SYNC_QUEUE,
  PLAYWRIGHT_QUEUE,
} from '../../core/queue/queue.constants';

@Injectable()
export class ConsoleHealthService {
  constructor(
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleQueue: Queue,
    @InjectQueue(PLAYWRIGHT_QUEUE) private readonly playwrightQueue: Queue,
    @InjectQueue(GSC_SYNC_QUEUE) private readonly gscQueue: Queue,
  ) {}

  async getQueueHealth() {
    const [article, playwright, gsc] = await Promise.all([
      this.articleQueue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      this.playwrightQueue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      this.gscQueue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
    ]);

    return {
      queues: [
        { name: ARTICLE_JOB_QUEUE, ...article },
        { name: PLAYWRIGHT_QUEUE, ...playwright },
        { name: GSC_SYNC_QUEUE, ...gsc },
      ],
    };
  }

  getProviderHealth() {
    return {
      providers: [
        {
          name: 'llm',
          configured: Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY),
        },
        {
          name: 'serper',
          configured: Boolean(process.env.SERPER_API_KEY),
        },
        {
          name: 'semrush',
          mode: process.env.SEMRUSH_ENABLED === 'true' ? 'rpa' : 'stub',
          configured: process.env.SEMRUSH_ENABLED === 'true',
        },
        {
          name: 'image',
          configured: Boolean(process.env.BFL_API_KEY),
        },
        {
          name: 'smtp',
          configured: Boolean(process.env.SMTP_HOST),
        },
      ],
    };
  }
}
