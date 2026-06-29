/**
 * 文章产线工作流步骤（前后端共用）。
 */

export const WORKFLOW_STEPS = [
  'serp',
  'brief',
  'draft',
  'linking',
  'images',
  'optimizing',
  'paraphrasing',
  'ymyl',
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  serp: '分析搜索结果',
  brief: '生成大纲',
  draft: '撰写正文',
  linking: '植入站内链接',
  images: '生成配图',
  optimizing: 'SEO 评分优化',
  paraphrasing: '原创度优化',
  ymyl: '内容安全审查',
};

export const WORKFLOW_STEP_ESTIMATES: Record<WorkflowStep, string> = {
  serp: '约 1–3 分钟',
  brief: '约 30–60 秒',
  draft: '约 1–2 分钟',
  linking: '约 30 秒',
  images: '约 1–3 分钟',
  optimizing: '约 5–20 分钟',
  paraphrasing: '约 1–2 分钟',
  ymyl: '约 30 秒',
};

export function workflowStepLabel(step?: WorkflowStep | string): string {
  if (!step) return '—';
  return WORKFLOW_STEP_LABELS[step as WorkflowStep] ?? step;
}
