/**
 * SEO 项目成员权限预设模板（三档岗位）。
 */

export interface PermissionPreset {
  id: string;
  label: string;
  description: string;
  permissions: string[];
}

const EXECUTOR_PERMISSIONS = ['seo:job:read', 'seo:job:create', 'seo:keyword:manage'] as const;

const REVIEWER_PERMISSIONS = ['seo:job:read', 'seo:job:review', 'seo:site:manage'] as const;

const VIEWER_PERMISSIONS = ['seo:job:read'] as const;

export const SEO_PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: 'executor',
    label: '执行',
    description: '选词、建任务、改稿',
    permissions: [...EXECUTOR_PERMISSIONS],
  },
  {
    id: 'reviewer',
    label: '审核',
    description: '确认大纲、敏感审核、CMS 发布',
    permissions: [...REVIEWER_PERMISSIONS],
  },
  {
    id: 'viewer',
    label: '只读',
    description: '仅查看任务与进度',
    permissions: [...VIEWER_PERMISSIONS],
  },
];

/** 兼容旧 presetId（访问申请审批等历史数据） */
const PRESET_ALIASES: Record<string, readonly string[]> = {
  content_editor: EXECUTOR_PERMISSIONS,
  executor: EXECUTOR_PERMISSIONS,
  reviewer: REVIEWER_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
};

export function resolvePresetPermissions(presetId: string): string[] {
  const alias = PRESET_ALIASES[presetId];
  if (alias) {
    return [...alias];
  }
  const preset = SEO_PERMISSION_PRESETS.find((p) => p.id === presetId);
  return preset ? [...preset.permissions] : [];
}

export function listPermissionPresets() {
  return SEO_PERMISSION_PRESETS.map(({ id, label, description, permissions }) => ({
    id,
    label,
    description,
    permissions,
  }));
}
