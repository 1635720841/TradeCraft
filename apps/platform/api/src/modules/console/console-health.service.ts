/**
 * Console 运维健康：队列深度与 Provider 状态。
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';
import {
  ARTICLE_JOB_QUEUE,
  GSC_SYNC_QUEUE,
  PLAYWRIGHT_QUEUE,
} from '../../core/queue/queue.constants';
import { getQueueJobEnrichment } from '../../core/console/queue-job-enrichment.port';
import { PrismaService } from '../../core/database/prisma.service';

export interface ConsoleQueueJobItem {
  bullJobId: string;
  queue: string;
  queueLabel: string;
  state: string;
  position: number | null;
  enqueuedAt: string | null;
  jobId?: string;
  jobName?: string;
  traceId: string;
  organizationId: string;
  organizationName: string | null;
  projectId?: string;
  targetKeyword: string | null;
  articleStatus: string | null;
  workflowPhase: string | null;
  resumeFrom: string | null;
}

type QueueJobState = 'waiting' | 'active' | 'delayed' | 'failed' | 'all';

const QUEUE_LABELS: Record<string, string> = {
  [ARTICLE_JOB_QUEUE]: '文章生成',
  [PLAYWRIGHT_QUEUE]: 'Semrush RPA',
  [GSC_SYNC_QUEUE]: 'GSC 同步',
};

@Injectable()
export class ConsoleHealthService {
  constructor(
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleQueue: Queue,
    @InjectQueue(PLAYWRIGHT_QUEUE) private readonly playwrightQueue: Queue,
    @InjectQueue(GSC_SYNC_QUEUE) private readonly gscQueue: Queue,
    private readonly prisma: PrismaService,
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

  async getQueueJobs(options: {
    state?: QueueJobState;
    queue?: string;
    limit?: number;
  } = {}): Promise<{ items: ConsoleQueueJobItem[]; total: number; truncated: boolean }> {
    const safeLimit = Math.min(Math.max(options.limit ?? 100, 1), 200);
    const states =
      !options.state || options.state === 'all'
        ? (['waiting', 'active', 'delayed'] as const)
        : ([options.state] as const);

    const queueDefs = [
      { name: ARTICLE_JOB_QUEUE, queue: this.articleQueue },
      { name: PLAYWRIGHT_QUEUE, queue: this.playwrightQueue },
      { name: GSC_SYNC_QUEUE, queue: this.gscQueue },
    ].filter((item) => !options.queue || item.name === options.queue);

    const rawItems: Array<{
      bullJob: Job;
      queueName: string;
      state: string;
      position: number | null;
    }> = [];

    for (const { name, queue } of queueDefs) {
      for (const state of states) {
        const jobs = await this.fetchJobsByState(queue, state, safeLimit - 1);
        jobs.forEach((bullJob, index) => {
          rawItems.push({
            bullJob,
            queueName: name,
            state,
            position: state === 'waiting' ? index + 1 : null,
          });
        });
      }
    }

    const articleJobIds = [
      ...new Set(
        rawItems
          .map((item) => this.resolveArticleJobId(item.bullJob, item.queueName))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const enrichment = getQueueJobEnrichment();
    const articleMap = enrichment
      ? await enrichment.enrichArticleJobs(articleJobIds)
      : new Map();

    const orgIds = [...new Set([...articleMap.values()].map((row) => row.organizationId))];
    const orgRows =
      orgIds.length > 0
        ? await this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : [];
    const orgMap = new Map(orgRows.map((row) => [row.id, row.name]));

    const items = rawItems.flatMap((item) => {
      const queueName = item.queueName;
      const articleJobId = this.resolveArticleJobId(item.bullJob, queueName);

      if (queueName === GSC_SYNC_QUEUE) {
        return [this.buildGscQueueJobItem(item)];
      }

      if (!articleJobId) return [];

      const payload = item.bullJob.data as {
        jobId?: string;
        traceId?: string;
        organizationId?: string;
        projectId?: string;
        resumeFrom?: string;
      };
      const article = articleMap.get(articleJobId);
      const organizationId = article?.organizationId ?? payload.organizationId ?? '';

      const row: ConsoleQueueJobItem = {
        bullJobId: String(item.bullJob.id),
        queue: queueName,
        queueLabel: QUEUE_LABELS[queueName] ?? queueName,
        state: item.state,
        position: item.position,
        enqueuedAt: item.bullJob.timestamp
          ? new Date(item.bullJob.timestamp).toISOString()
          : null,
        jobId: articleJobId,
        jobName: item.bullJob.name,
        traceId: payload.traceId ?? '',
        organizationId,
        organizationName: orgMap.get(organizationId) ?? null,
        projectId: article?.projectId ?? payload.projectId ?? '',
        targetKeyword: article?.targetKeyword ?? null,
        articleStatus: article?.status ?? null,
        workflowPhase: article?.workflowPhase ?? null,
        resumeFrom: payload.resumeFrom ?? null,
      };
      return [row];
    });

    items.sort((a, b) => {
      const stateOrder = (s: string) =>
        s === 'active' ? 0 : s === 'waiting' ? 1 : s === 'failed' ? 2 : 3;
      const byState = stateOrder(a.state) - stateOrder(b.state);
      if (byState !== 0) return byState;
      if (a.position != null && b.position != null) return a.position - b.position;
      return (a.enqueuedAt ?? '').localeCompare(b.enqueuedAt ?? '');
    });

    const total = items.length;
    const limited = items.slice(0, safeLimit);

    return { items: limited, total, truncated: total > safeLimit };
  }

  private async fetchJobsByState(
    queue: Queue,
    state: 'waiting' | 'active' | 'delayed' | 'failed',
    end: number,
  ): Promise<Job[]> {
    if (state === 'waiting') return queue.getWaiting(0, end);
    if (state === 'active') return queue.getActive(0, end);
    if (state === 'delayed') return queue.getDelayed(0, end);
    return queue.getFailed(0, end);
  }

  private buildGscQueueJobItem(item: {
    bullJob: Job;
    queueName: string;
    state: string;
    position: number | null;
  }): ConsoleQueueJobItem {
    return {
      bullJobId: String(item.bullJob.id),
      queue: item.queueName,
      queueLabel: QUEUE_LABELS[item.queueName] ?? item.queueName,
      state: item.state,
      position: item.position,
      enqueuedAt: item.bullJob.timestamp
        ? new Date(item.bullJob.timestamp).toISOString()
        : null,
      jobName: item.bullJob.name ?? 'sync-stale',
      traceId: '',
      organizationId: '',
      organizationName: null,
      targetKeyword: 'GSC 定时同步',
      articleStatus: null,
      workflowPhase: null,
      resumeFrom: null,
    };
  }

  private resolveArticleJobId(bullJob: Job, queueName: string): string | null {
    const data = bullJob.data as { jobId?: string };
    if (!data.jobId) return null;
    if (queueName === ARTICLE_JOB_QUEUE || queueName === PLAYWRIGHT_QUEUE) {
      return data.jobId;
    }
    return null;
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
