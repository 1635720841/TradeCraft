/**
 * 项目工作台导航路径：按 project-type 插件 routePrefix 生成 enterPath。
 */

import {
  getProjectTypeCatalogEntry,
  isProjectTypeWorkbenchReady,
  listVisibleProjectTypeCatalog,
} from './project-type.descriptors';
import { getProjectTypePlugin } from './project-type.registry';

export { isProjectTypeWorkbenchReady } from './project-type.descriptors';

export function buildProjectEnterPath(projectId: string, projectType: string): string | null {
  if (!isProjectTypeWorkbenchReady(projectType)) {
    return null;
  }
  const plugin = getProjectTypePlugin(projectType);
  if (!plugin) {
    return null;
  }
  return `/projects/${projectId}/${plugin.routePrefix()}/overview`;
}

export function buildProjectResourcePath(
  projectId: string,
  projectType: string,
  segment: string,
  resourceId?: string,
): string | null {
  const plugin = getProjectTypePlugin(projectType);
  if (!plugin) return null;
  const base = `/projects/${projectId}/${plugin.routePrefix()}`;
  if (resourceId) return `${base}/${segment}/${resourceId}`;
  return `${base}/${segment}`;
}

export function listProjectTypeCatalogForApi(): Array<{
  type: string;
  label: string;
  workbenchReady: boolean;
  description: string;
  routePrefix: string;
}> {
  return listVisibleProjectTypeCatalog().map((entry) => {
    const plugin = getProjectTypePlugin(entry.type);
    return {
      type: entry.type,
      label: entry.label,
      workbenchReady: entry.workbenchReady,
      description: entry.description,
      routePrefix: plugin?.routePrefix() ?? entry.type,
    };
  });
}

export function getProjectTypeDescription(type: string): string {
  return getProjectTypeCatalogEntry(type)?.description ?? '企业内容生产项目';
}
