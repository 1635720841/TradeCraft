/**
 * 工作流步骤注册：serp / brief / ymyl POC（委托 WorkflowService 执行）。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { registerWorkflowStepHandler } from './workflow-step.registry';
import { WorkflowService } from './workflow.service';

@Injectable()
export class WorkflowStepRegistrationService implements OnModuleInit {
  constructor(private readonly workflowService: WorkflowService) {}

  onModuleInit(): void {
    registerWorkflowStepHandler({
      id: 'serp',
      jobStatus: 'RESEARCHING',
      run: (ctx) => this.workflowService.executeSerpStep(ctx),
    });
    registerWorkflowStepHandler({
      id: 'brief',
      jobStatus: 'DRAFTING',
      run: (ctx) => this.workflowService.executeBriefStep(ctx),
    });
    registerWorkflowStepHandler({
      id: 'ymyl',
      jobStatus: 'REVIEWING',
      run: (ctx) => this.workflowService.executeYmylStep(ctx),
    });
  }
}
