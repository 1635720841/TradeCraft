/**
 * Prompt 功能槽位静态元数据（展示用，不含运行时绑定版本）。
 */

export type PromptRuntimeSlotId =
  | 'brief'
  | 'draft'
  | 'localOptimize'
  | 'semrushOptimize'
  | 'rewrite';

export const PROMPT_RUNTIME_SLOT_IDS: PromptRuntimeSlotId[] = [
  'brief',
  'draft',
  'localOptimize',
  'semrushOptimize',
  'rewrite',
];

/** 种子 / 兜底默认版本 */
export const PROMPT_DEFAULT_VERSIONS: Record<PromptRuntimeSlotId, string> = {
  brief: 'seo_brief_v1',
  draft: 'seo_draft_v1',
  localOptimize: 'seo_optimize_v3',
  semrushOptimize: 'seo_optimize_semrush_v1',
  rewrite: 'seo_rewrite_v1',
};

export interface PromptSlotMetadata {
  id: PromptRuntimeSlotId;
  label: string;
  shortLabel: string;
  workflowStep: string;
  trigger: string;
  uiLocation: string;
  placeholders: string[];
  sortOrder: number;
  /** 推荐版本前缀，用于下拉筛选 */
  versionPrefix: string;
}

export const PROMPT_SLOT_METADATA: PromptSlotMetadata[] = [
  {
    id: 'brief',
    label: 'Brief 大纲生成',
    shortLabel: 'Brief',
    workflowStep: 'M4',
    trigger: 'SERP 抓取完成后，任务自动进入「研究中」',
    uiLocation: 'SEO 任务详情 → Brief 面板',
    placeholders: ['{{keyword}}', '{{outputLanguage}}', '{{brandVoice}}', '{{serpContext}}'],
    sortOrder: 1,
    versionPrefix: 'seo_brief_',
  },
  {
    id: 'draft',
    label: '文章初稿生成',
    shortLabel: '初稿',
    workflowStep: 'M5',
    trigger: 'Brief 完成后，任务进入「撰写中」',
    uiLocation: 'SEO 任务详情 → 初稿预览',
    placeholders: ['{{keyword}}', '{{outputLanguage}}', '{{brandVoice}}', '{{brief}}'],
    sortOrder: 2,
    versionPrefix: 'seo_draft_',
  },
  {
    id: 'localOptimize',
    label: '本地 SEO 自动优化',
    shortLabel: '本地优化',
    workflowStep: 'M6',
    trigger: '本地预检分数 < 95 时，AI 多轮改稿',
    uiLocation: 'SEO 任务详情 → SEO 评分 → 优化历史',
    placeholders: [
      '{{keyword}}',
      '{{localScore}}',
      '{{localScoreTarget}}',
      '{{localScoreBreakdown}}',
      '{{content}}',
    ],
    sortOrder: 3,
    versionPrefix: 'seo_optimize_',
  },
  {
    id: 'semrushOptimize',
    label: 'Semrush 终检优化',
    shortLabel: 'Semrush 优化',
    workflowStep: 'M6',
    trigger: 'Semrush 分数 < 9.0 时，按侧栏建议改稿',
    uiLocation: 'SEO 任务详情 → SEO 评分 → 优化历史',
    placeholders: [
      '{{keyword}}',
      '{{semrushCompetitorWordCount}}',
      '{{content}}',
      '{{suggestions}}',
    ],
    sortOrder: 4,
    versionPrefix: 'seo_optimize_semrush_',
  },
  {
    id: 'rewrite',
    label: '手动 AI 改写',
    shortLabel: 'AI 改写',
    workflowStep: '旁路',
    trigger: '运营在任务详情点击「AI 改写」并提交',
    uiLocation: 'SEO 任务详情 → 改写结果卡片',
    placeholders: ['{{keyword}}', '{{instruction}}', '{{content}}', '{{briefSummary}}'],
    sortOrder: 5,
    versionPrefix: 'seo_rewrite_',
  },
];

export const PROMPT_LEGACY_VERSION_HINTS: Record<string, string> = {
  seo_optimize_v1: '旧版本地优化 Prompt，已被新版本替代',
  seo_optimize_v2: '旧版 B2B 优化 Prompt，已被新版本替代',
};

export function isPromptRuntimeSlotId(value: string): value is PromptRuntimeSlotId {
  return (PROMPT_RUNTIME_SLOT_IDS as string[]).includes(value);
}

export function getSlotMetadata(slotId: PromptRuntimeSlotId): PromptSlotMetadata {
  const meta = PROMPT_SLOT_METADATA.find((item) => item.id === slotId);
  if (!meta) {
    throw new Error(`Unknown prompt slot: ${slotId}`);
  }
  return meta;
}

export interface PromptRuntimeSlot extends PromptSlotMetadata {
  activeVersion: string;
  bindingUpdatedAt?: string;
}
