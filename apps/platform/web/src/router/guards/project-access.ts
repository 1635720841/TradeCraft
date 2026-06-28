/**
 * 项目工作台路由守卫：未加入或非开放期用户不可进入；子路由可要求项目级 seo:* 权限。
 */

import type { RouteLocationNormalized } from "vue-router";
import { storageLocal } from "@pureadmin/utils";
import { getOrgProject } from "@/api/org/projects";
import { userKey } from "@/utils/auth";
import { hasProjectSeoPermission } from "@/utils/project-seo-permission";

export { hasProjectSeoPermission } from "@/utils/project-seo-permission";

const permissionCache = new Map<
  string,
  { canEnter: boolean; permissions: string[]; at: number }
>();
const CACHE_MS = 60_000;

function hasAnyPermission(
  effective: string[],
  required: string | string[] | undefined
): boolean {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.some(id => effective.includes(id));
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

/** 校验 canEnter + 可选 meta.seoPermission（项目成员权限，非企业级） */
export async function ensureProjectRouteAccess(
  to: RouteLocationNormalized
): Promise<boolean> {
  const projectId = to.params.projectId;
  const id = Array.isArray(projectId) ? projectId[0] : projectId;
  if (!id) {
    return false;
  }

  const userInfo = storageLocal().getItem(userKey);
  if (userInfo?.roles?.includes("super_admin")) {
    return true;
  }

  try {
    const access = await loadProjectAccess(id);
    if (!access.canEnter) {
      return false;
    }
    const seoPermission = to.meta?.seoPermission as string | string[] | undefined;
    return hasAnyPermission(access.permissions, seoPermission);
  } catch {
    return false;
  }
}
