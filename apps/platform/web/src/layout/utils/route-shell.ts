import type { RouteLocationNormalizedLoaded } from "vue-router";

/** 项目工作台路由：隐藏平台侧栏，顶栏需展示品牌 Logo */
export function isProjectWorkbenchPath(path: string): boolean {
  return /\/projects\/[^/]+\/seo-factory(?:\/|$)/.test(path);
}

/** 工作台壳层路由 key：同一项目内切换子页时保持稳定，避免整页 remount */
export function getProjectWorkbenchShellKey(path: string): string | null {
  const match = path.match(/^(\/projects\/[^/]+\/seo-factory)/);
  return match?.[1] ?? null;
}

/** LayContent 渲染 key：工作台内用壳层 key，其余页面仍用 fullPath */
export function getContentRouteKey(route: RouteLocationNormalizedLoaded): string {
  return getProjectWorkbenchShellKey(route.path) ?? route.fullPath;
}

/** 工作台内部模块切换（概览/任务/选题等） */
export function isProjectWorkbenchInnerNavigation(
  fromPath: string,
  toPath: string
): boolean {
  const fromShell = getProjectWorkbenchShellKey(fromPath);
  const toShell = getProjectWorkbenchShellKey(toPath);
  return Boolean(fromShell && toShell && fromShell === toShell);
}