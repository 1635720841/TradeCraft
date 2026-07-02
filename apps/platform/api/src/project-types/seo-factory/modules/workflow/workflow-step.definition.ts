/**
 * 工作流步骤定义元数据（POC：与 registry handler 配合，后续可扩展 jobStatus / pauseAfter）。
 */

import type { JobStatus } from '@prisma/client';
import type { WorkflowStep } from '@wm/shared-core';
import type { WorkflowStepContext } from './workflow-step.registry';

export interface WorkflowStepDefinition {
  id: WorkflowStep;
  mNumber?: string;
  jobStatus?: JobStatus | 'REVIEWING';
  shouldSkip?: (ctx: WorkflowStepContext) => Promise<boolean>;
  run: (ctx: WorkflowStepContext) => Promise<void>;
  pauseAfter?: boolean;
}
