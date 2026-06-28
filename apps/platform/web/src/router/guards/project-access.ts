/**
 * 项目工作台路由守卫：未加入或非开放期用户不可进入。
 */

import { getProject } from "@/api/platform/project";

export async function ensureProjectEnterable(
  projectId: string | string[] | undefined
): Promise<boolean> {
  const id = Array.isArray(projectId) ? projectId[0] : projectId;
  if (!id) {
    return false;
  }

  try {
    const project = await getProject(id);
    return project.canEnter === true;
  } catch {
    return false;
  }
}
