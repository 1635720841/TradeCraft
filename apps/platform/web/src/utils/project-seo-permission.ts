/**
 * 项目级 seo:* 权限判断（纯函数，供路由守卫与 UI 复用）。
 */

function hasAnyPermission(
  effective: string[],
  required: string | string[] | undefined
): boolean {
  if (!required) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.some(id => effective.includes(id));
}

export function hasProjectSeoPermission(
  effective: string[],
  required: string | string[] | undefined,
  options?: { superAdmin?: boolean }
): boolean {
  if (options?.superAdmin) return true;
  return hasAnyPermission(effective, required);
}

/** 大纲确认、敏感审核 */
export function canReviewSeoJob(
  effective: string[],
  options?: { superAdmin?: boolean }
): boolean {
  return hasProjectSeoPermission(effective, ['seo:job:review', 'seo:site:manage'], options);
}

/** CMS 发布（执行岗或站点管理员） */
export function canPublishSeoJob(
  effective: string[],
  options?: { superAdmin?: boolean }
): boolean {
  return hasProjectSeoPermission(effective, ['seo:job:create', 'seo:site:manage'], options);
}
