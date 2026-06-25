/**
 * SEO 查分/优化流水线统一流程日志。
 *
 * 检索：日志中 `action: "seo_flow"` 或消息前缀 `[SEO流程]` 可串起整次任务。
 *
 * 入口：
 * - logSeoPipelineFlow
 * - summarizeFlowKeywords
 */

import { countWords } from '@wm/shared-core';
import type { LoggerService } from '../../../core/logger/logger.service';

/** 与现有 action 字段并列，便于 `rg '"action":"seo_flow"'` 过滤整链 */
export const SEO_PIPELINE_FLOW_ACTION = 'seo_flow';

export interface SeoFlowContext {
  traceId: string;
  jobId: string;
  organizationId?: string;
  projectId?: string;
}

export type SeoPipelineFlowStep =
  | 'pipeline.start'
  | 'pipeline.local_skip'
  | 'pipeline.local_gate'
  | 'pipeline.local_round_start'
  | 'pipeline.local_round_end'
  | 'pipeline.semrush_baseline_rpa_start'
  | 'pipeline.semrush_baseline_rpa_end'
  | 'pipeline.semrush_round_plan'
  | 'pipeline.semrush_llm_start'
  | 'pipeline.llm_optimize_done'
  | 'pipeline.semrush_surgical_start'
  | 'pipeline.semrush_surgical_skip'
  | 'pipeline.semrush_rpa_recheck_start'
  | 'pipeline.semrush_rpa_recheck_end'
  | 'pipeline.semrush_rpa_skip_proxy'
  | 'pipeline.semrush_round_decision'
  | 'pipeline.semrush_round_accept'
  | 'pipeline.semrush_round_rollback'
  | 'pipeline.completed';

export type SemrushRpaFlowKind = 'baseline' | 'recheck' | 'manual' | 'confirm';

export interface SemrushRpaFlowMeta {
  rpaKind: SemrushRpaFlowKind;
  round?: number;
  poolKeywords?: string[];
  swaRecommended?: string[];
  swaMissing?: string[];
  recheckDecision?: string;
}

export function summarizeFlowKeywords(keywords?: string[], max = 12): string[] {
  return (keywords ?? []).filter(Boolean).slice(0, max);
}

export function flowWordCount(content: string): number {
  return countWords(content);
}

export function logSeoPipelineFlow(
  logger: LoggerService,
  ctx: SeoFlowContext,
  step: SeoPipelineFlowStep,
  detail: Record<string, unknown> = {},
): void {
  logger.info(`[SEO流程] ${step}`, {
    traceId: ctx.traceId,
    jobId: ctx.jobId,
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    action: SEO_PIPELINE_FLOW_ACTION,
    flowStep: step,
    ...detail,
  });
}
