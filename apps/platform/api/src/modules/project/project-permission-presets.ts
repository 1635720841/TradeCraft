/**
 * SEO 项目成员权限预设模板。
 */

export interface PermissionPreset {
  id: string;
  label: string;
  permissions: string[];
}

export const SEO_PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: 'content_editor',
    label: '内容编辑',
    permissions: ['seo:job:read', 'seo:job:create', 'seo:keyword:manage'],
  },
  {
    id: 'reviewer',
    label: '审核发布',
    permissions: ['seo:job:read', 'seo:site:manage'],
  },
  {
    id: 'viewer',
    label: '只读',
    permissions: ['seo:job:read'],
  },
];

export function resolvePresetPermissions(presetId: string): string[] {
  const preset = SEO_PERMISSION_PRESETS.find((p) => p.id === presetId);
  return preset ? [...preset.permissions] : [];
}

export function listPermissionPresets() {
  return SEO_PERMISSION_PRESETS.map(({ id, label, permissions }) => ({
    id,
    label,
    permissions,
  }));
}
