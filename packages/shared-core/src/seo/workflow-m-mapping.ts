/**
 * M 编号与 workflow step key 单一真相源（文档 / Prompt 元数据对齐用）。
 */

import type { WorkflowStep } from './workflow-steps';

/** runtime step key → 架构 M 编号（无编号步骤为 undefined） */
export const WORKFLOW_M_MAPPING: Record<WorkflowStep, string | undefined> = {
  serp: 'M1-M3',
  brief: 'M4',
  draft: 'M5',
  linking: 'M8',
  images: 'M9',
  optimizing: 'M6',
  paraphrasing: undefined,
  ymyl: 'M7',
};

export const WORKFLOW_M_LABELS: Record<string, string> = {
  'M1-M3': 'SERP 分析',
  M4: '大纲 Brief',
  M5: '初稿',
  M6: 'Semrush 优化',
  M7: 'YMYL 审查',
  M8: '内链植入',
  M9: '配图',
};

export function workflowStepMNumber(step: WorkflowStep): string | undefined {
  return WORKFLOW_M_MAPPING[step];
}
