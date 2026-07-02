/**
 * 项目工作台导航：根据 enterPath 跳转。
 */

import type { Router } from "vue-router";

export function buildProjectEnterPathFromCatalog(
  projectId: string,
  projectType: string,
  catalog: Array<{ type: string; workbenchReady?: boolean; routePrefix?: string }>
): string | null {
  const entry = catalog.find((item) => item.type === projectType);
  if (!entry?.workbenchReady || !entry.routePrefix) return null;
  return `/projects/${projectId}/${entry.routePrefix}/overview`;
}

export function navigateToProjectWorkbench(router: Router, enterPath: string) {
  void router.push(enterPath);
}

export function resolveProjectTypeHint(
  type: string,
  catalog: Array<{ type: string; description?: string; workbenchReady?: boolean }>
): string {
  const entry = catalog.find((item) => item.type === type);
  if (entry?.workbenchReady === false) {
    return "工作台即将上线";
  }
  return entry?.description ?? "企业内容生产项目";
}

export function resolveProjectTypeLabel(
  type: string,
  catalog: Array<{ type: string; label: string }>
): string {
  return catalog.find((item) => item.type === type)?.label ?? type;
}
