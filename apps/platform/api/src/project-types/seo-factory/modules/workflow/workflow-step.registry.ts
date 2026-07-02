/**
 * 工作流步骤注册表：按 WORKFLOW_STEPS 顺序执行已注册 handler。
 */

import type { JobStatus } from '@prisma/client';
import { WORKFLOW_STEPS, type WorkflowStep } from '@wm/shared-core';

import type { ArticleJobScraperOptions } from '../../processors/article-job.processor';

export interface WorkflowStepContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  targetKeyword: string;
  brandVoice?: string;
  targetMarket?: string;
  contentLanguage: string;
  siteId: string;
  scraperOptions?: ArticleJobScraperOptions;
}

export interface WorkflowStepHandler {
  id: WorkflowStep;
  jobStatus?: JobStatus | 'REVIEWING';
  run: (ctx: WorkflowStepContext) => Promise<void>;
}

const handlers = new Map<WorkflowStep, WorkflowStepHandler>();

export function registerWorkflowStepHandler(handler: WorkflowStepHandler): void {
  handlers.set(handler.id, handler);
}

export function getWorkflowStepHandler(step: WorkflowStep): WorkflowStepHandler | undefined {
  return handlers.get(step);
}

export function getWorkflowStepJobStatus(
  step: WorkflowStep,
): JobStatus | 'REVIEWING' | undefined {
  return handlers.get(step)?.jobStatus;
}

export function getOrderedWorkflowStepHandlers(): WorkflowStepHandler[] {
  return WORKFLOW_STEPS.map((step) => handlers.get(step)).filter(
    (handler): handler is WorkflowStepHandler => handler != null,
  );
}

export function isWorkflowStepRegistered(step: WorkflowStep): boolean {
  return handlers.has(step);
}
