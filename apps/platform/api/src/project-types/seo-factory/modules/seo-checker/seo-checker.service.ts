/**
 * SEO 查分服务：本地 TF-IDF 前置校验 → 达标后 Semrush 终检。
 *
 * 边界：
 * - 不负责：初稿生成（LlmService）、工作流状态机（WorkflowService）
 *
 * 入口：
 * - SeoCheckerService
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { JobStatus } from '@prisma/client';
import type { LlmJobContext } from '../llm/llm.service';
import { SeoCheckerPipelineService } from './seo-checker-pipeline.service';
import { SeoCheckerLifecycleService } from './seo-checker-lifecycle.service';
import { isSemrushWorkAbortedError } from './seo-checker-lifecycle.service';

@Injectable()
export class SeoCheckerService implements OnModuleInit {
  constructor(
    private readonly pipelineService: SeoCheckerPipelineService,
    private readonly lifecycleService: SeoCheckerLifecycleService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStaleSemrushChecks();
  }

  async runPostDraftPipeline(ctx: LlmJobContext): Promise<void> {
    return this.pipelineService.runPostDraftPipeline(ctx);
  }

  async refreshLocalSeoScore(ctx: LlmJobContext): Promise<void> {
    return this.lifecycleService.refreshLocalSeoScore(ctx);
  }

  async runManualSemrushCheck(ctx: LlmJobContext): Promise<void> {
    return this.lifecycleService.runManualSemrushCheck(ctx);
  }

  isSemrushWorkAbortedError(error: unknown): boolean {
    return isSemrushWorkAbortedError(error);
  }

  async markManualSemrushFailed(ctx: LlmJobContext, errorMessage: string): Promise<void> {
    return this.lifecycleService.markManualSemrushFailed(ctx, errorMessage);
  }

  async cancelManualSemrushCheck(ctx: LlmJobContext, reason: string): Promise<void> {
    return this.lifecycleService.cancelManualSemrushCheck(ctx, reason);
  }

  async recoverStaleSemrushChecks(): Promise<void> {
    return this.lifecycleService.recoverStaleSemrushChecks();
  }

  async recoverOrphanOptimizingJob(ctx: LlmJobContext, reason: string): Promise<JobStatus> {
    return this.lifecycleService.recoverOrphanOptimizingJob(ctx, reason);
  }
}
