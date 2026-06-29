/**
 * 项目任务通知收件人判定（纯函数，供单测）。
 */

import { ProjectMemberRole } from '@prisma/client';

export function canReceiveJobActionNotifications(
  permissions: readonly string[],
  role: ProjectMemberRole,
): boolean {
  if (role === ProjectMemberRole.OWNER) {
    return true;
  }
  return (
    permissions.includes('seo:job:create') ||
    permissions.includes('seo:job:review') ||
    permissions.includes('seo:site:manage')
  );
}

/**
 * 个人待办：是否具备审核类待办（大纲 / 敏感审核）。
 */
export function canReviewInSeoProject(permissions: readonly string[]): boolean {
  return (
    permissions.includes('seo:job:review') || permissions.includes('seo:site:manage')
  );
}

export function resolveMyReviewPendingCount(
  permissions: readonly string[],
  pendingBriefCount: number,
  pendingReviewCount: number,
): number {
  if (!canReviewInSeoProject(permissions)) {
    return 0;
  }
  return pendingBriefCount + pendingReviewCount;
}
