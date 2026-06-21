/** 手动 Semrush 检测超时（毫秒），须大于队列主等待+宽限，避免 RPA 仍在跑时被僵死清理 */
export const SEMRUSH_MANUAL_CHECK_STALE_MS = 15 * 60 * 1000;

/** OPTIMIZING 且无 pending 时，超过此时长视为僵死（工作流崩溃或状态未回写） */
export const SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS = Number(
  process.env.SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS ?? 8 * 60 * 1000,
);

export interface SemrushCheckPending {
  startedAt: string;
  previousStatus: string;
}

export function isSemrushCheckStale(startedAt: string, now = Date.now()): boolean {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return now - started > SEMRUSH_MANUAL_CHECK_STALE_MS;
}

export function isOptimizingOrphanStale(updatedAt: Date, now = Date.now()): boolean {
  return now - updatedAt.getTime() > SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS;
}

/** 取任务最近一次活动心跳（DB updatedAt / workflowProgress / pending） */
export function resolveOptimizingHeartbeatMs(
  seoCheckData: unknown,
  updatedAt: Date,
  now = Date.now(),
): number {
  const data = (seoCheckData ?? {}) as {
    workflowProgress?: { updatedAt?: string };
    semrush?: { pending?: SemrushCheckPending };
  };

  const candidates = [updatedAt.getTime()];

  const progressAt = data.workflowProgress?.updatedAt;
  if (progressAt) {
    const t = Date.parse(progressAt);
    if (!Number.isNaN(t)) candidates.push(t);
  }

  const pendingAt = data.semrush?.pending?.startedAt;
  if (pendingAt) {
    const t = Date.parse(pendingAt);
    if (!Number.isNaN(t)) candidates.push(t);
  }

  return Math.max(...candidates.filter((t) => t > 0 && t <= now + 60_000));
}

/**
 * OPTIMIZING 但无 pending：多为工作流中断或失败后状态未恢复。
 * 有 pending 时视为手动检测进行中，不由本函数恢复（超时走 isSemrushCheckStale）。
 */
export function shouldRecoverOrphanOptimizing(input: {
  status: string;
  seoCheckData: unknown;
  updatedAt: Date;
  now?: number;
}): boolean {
  if (input.status !== 'OPTIMIZING') return false;

  const data = (input.seoCheckData ?? {}) as {
    semrush?: { pending?: SemrushCheckPending };
  };
  if (data.semrush?.pending) return false;

  const now = input.now ?? Date.now();
  const lastActivity = resolveOptimizingHeartbeatMs(input.seoCheckData, input.updatedAt, now);
  return now - lastActivity > SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS;
}
