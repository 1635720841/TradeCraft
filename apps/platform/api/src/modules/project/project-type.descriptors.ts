/**
 * 项目类型目录元数据（纯数据，不引用插件模块，避免与 ProjectModule 循环依赖）。
 */

export const PROJECT_TYPE_CATALOG = [
  { type: 'seo-factory', label: 'SEO 内容工厂' },
] as const;

export function listProjectTypeDescriptors(): Array<{ type: string; label: string }> {
  return PROJECT_TYPE_CATALOG.map(({ type, label }) => ({ type, label }));
}
