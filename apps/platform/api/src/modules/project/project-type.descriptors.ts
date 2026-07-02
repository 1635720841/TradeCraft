/**
 * 项目类型目录元数据（纯数据，不引用插件模块，避免与 ProjectModule 循环依赖）。
 */

export interface ProjectTypeCatalogEntry {
  type: string;
  label: string;
  workbenchReady: boolean;
  description: string;
}

export const PROJECT_TYPE_CATALOG: readonly ProjectTypeCatalogEntry[] = [
  {
    type: 'seo-factory',
    label: 'SEO 内容工厂',
    workbenchReady: true,
    description: '站点配置、关键词排产、文章生成与发布检查',
  },
  {
    type: 'demo-factory',
    label: '演示插件',
    workbenchReady: true,
    description: '用于验证多项目类型插件机制（开发/排障）',
  },
] as const;

export function isDemoFactoryEnabled(): boolean {
  return process.env.DEMO_FACTORY_ENABLED === 'true';
}

export function listVisibleProjectTypeCatalog(): readonly ProjectTypeCatalogEntry[] {
  return PROJECT_TYPE_CATALOG.filter(
    (entry) => entry.type !== 'demo-factory' || isDemoFactoryEnabled(),
  );
}

/** 当前环境允许创建的项目类型值 */
export function listCreatableProjectTypeValues(): string[] {
  return listVisibleProjectTypeCatalog()
    .filter((entry) => entry.workbenchReady)
    .map((entry) => entry.type);
}

export function getProjectTypeCatalogEntry(type: string): ProjectTypeCatalogEntry | undefined {
  return PROJECT_TYPE_CATALOG.find((entry) => entry.type === type);
}

export function isProjectTypeWorkbenchReady(type: string): boolean {
  return getProjectTypeCatalogEntry(type)?.workbenchReady === true;
}

export function listProjectTypeDescriptors(): Array<{ type: string; label: string }> {
  return PROJECT_TYPE_CATALOG.map(({ type, label }) => ({ type, label }));
}
