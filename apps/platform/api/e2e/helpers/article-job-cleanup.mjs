/**
 * E2E 文章任务配额清理：取消遗留可取消任务。
 * 并发槽位漂移由 OrgQueueLimiterService.reconcileActiveCount 在入队时自愈。
 */
const CANCELLABLE_STATUSES = new Set([
  'QUEUED',
  'PAUSED',
  'RESEARCHING',
  'DRAFTING',
  'LINKING',
  'ILLUSTRATING',
  'OPTIMIZING',
  'REVIEWING',
]);

/** 释放开发企业任务槽位，避免 trial 并行上限（2）阻塞冒烟用例 */
export async function prepareE2eJobQuota(apiRequest, accessToken, projectId) {
  const list = await apiRequest('GET', `/api/v1/projects/${projectId}/article-jobs?limit=50`, {
    token: accessToken,
  });

  for (const job of list.data ?? []) {
    if (!CANCELLABLE_STATUSES.has(job.status)) continue;
    try {
      await apiRequest('POST', `/api/v1/projects/${projectId}/article-jobs/${job.id}/cancel`, {
        token: accessToken,
        body: { reason: 'e2e quota cleanup' },
      });
    } catch {
      // 已取消或状态变化时忽略
    }
  }
}
