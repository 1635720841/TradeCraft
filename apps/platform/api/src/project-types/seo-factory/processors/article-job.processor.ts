/**
 * 文章生成处理器：消费 BullMQ 队列，驱动工作流（M1-M6）。
 *
 * 边界：
 * - 不负责：入队（ArticleJobService）
 *
 * 入口：
 * - ArticleJobProcessor
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ARTICLE_JOB_QUEUE } from '../../../core/queue/queue.constants';
import type { WorkflowResumeStep } from '../constants/workflow-resume';
import { WorkflowService } from '../modules/workflow/workflow.service';

export interface ArticleJobScraperOptions {
  serpArticleLimit?: number;
  serpArticlesOnly?: boolean;
}

export interface ArticleJobQueuePayload {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  resumeFrom?: WorkflowResumeStep;
  scraperOptions?: ArticleJobScraperOptions;
}

@Processor(ARTICLE_JOB_QUEUE)
export class ArticleJobProcessor extends WorkerHost {
  constructor(private readonly workflowService: WorkflowService) {
    super();
  }

  async process(job: Job<ArticleJobQueuePayload>): Promise<void> {
    const { jobId, traceId, organizationId, projectId, resumeFrom, scraperOptions } = job.data;

    try {
      await this.workflowService.runPhase1(
        jobId,
        traceId,
        organizationId,
        projectId,
        resumeFrom,
        scraperOptions,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '工作流执行失败';
      await this.workflowService.markFailed(jobId, traceId, organizationId, projectId, message);
      throw error;
    }
  }
}
