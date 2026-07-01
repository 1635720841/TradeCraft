/**
 * 项目工作台路由守卫：未加入或非开放期用户不可进入；子路由可要求项目级 seo:* 权限。
 *
 * super_admin 可绕过 canEnter（平台排障），但仍受 meta.seoPermission 约束（与 05-access-permissions 一致）。
 */

import type { RouteLocationNormalized } from "vue-router";
import { storageLocal } from "@pureadmin/utils";
import { hasAnyPermission } from "@wm/shared-core";
import { getOrgProject } from "@/api/org/projects";
import { userKey } from "@/utils/auth";
import { hasProjectSeoPermission } from "@/utils/project-seo-permission";

export { hasProjectSeoPermission } from "@/utils/project-seo-permission";

const permissionCache = new Map<
  string,
  { canEnter: boolean; permissions: string[]; at: number }
>();
const CACHE_MS = 60_000;

function matchesSeoPermission(
  effective: string[],
  required: string | string[] | undefined
): boolean {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return hasAnyPermission(effective, list);
}

async function loadProjectAccess(projectId: string) {
  const cached = permissionCache.get(projectId);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached;
  }
  const project = await getOrgProject(projectId);
  const entry = {
    canEnter: project.canEnter === true,
    permissions: project.effectivePermissions ?? [],
    at: Date.now()
  };
  permissionCache.set(projectId, entry);
  return entry;
}

export async function fetchProjectAccess(projectId: string) {
  return loadProjectAccess(projectId);
}

export function invalidateProjectAccessCache(projectId?: string) {
  if (projectId) {
    permissionCache.delete(projectId);
    return;
  }
  permissionCache.clear();
}

export async function ensureProjectEnterable(
  projectId: string | string[] | undefined
): Promise<boolean> {
  const id = Array.isArray(projectId) ? projectId[0] : projectId;
  if (!id) {
    return false;
  }

  try {
    const access = await loadProjectAccess(id);
    return access.canEnter;
  } catch {
    return false;
  }
}

export type ProjectRouteAccessResult = "ok" | "project_access" | "seo_permission" | "denied";

/** 校验 canEnter + 可选 meta.seoPermission（项目成员权限，非企业级） */
export async function ensureProjectRouteAccess(
  to: RouteLocationNormalized
): Promise<boolean> {
  return (await ensureProjectRouteAccessResult(to)) === "ok";
}

export async function ensureProjectRouteAccessResult(
  to: RouteLocationNormalized
): Promise<ProjectRouteAccessResult> {
  const projectId = to.params.projectId;
  const id = Array.isArray(projectId) ? projectId[0] : projectId;
  if (!id) {
    return "denied";
  }

  const userInfo = storageLocal().getItem<{ roles?: string[] }>(userKey);
  const isSuperAdmin = userInfo?.roles?.includes("super_admin") === true;

  try {
    const access = await loadProjectAccess(id);
    if (!isSuperAdmin && !access.canEnter) {
      return "project_access";
    }
    const seoPermission = to.meta?.seoPermission as string | string[] | undefined;
    if (!matchesSeoPermission(access.permissions, seoPermission)) {
      return "seo_permission";
    }
    return "ok";
  } catch {
    return "denied";
  }
}
