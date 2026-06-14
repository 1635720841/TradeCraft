/** 手动 Semrush 检测超时（毫秒），超过视为僵死任务 */
export const SEMRUSH_MANUAL_CHECK_STALE_MS = 5 * 60 * 1000;

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

/** OPTIMIZING 但无 pending：多为工作流中断或失败后状态未恢复 */
export function shouldRecoverOrphanOptimizing(input: {
  status: string;
  seoCheckData: unknown;
  updatedAt: Date;
}): boolean {
  if (input.status !== 'OPTIMIZING') return false;

  const data = (input.seoCheckData ?? {}) as {
    semrush?: { pending?: SemrushCheckPending; lastManualCheckError?: string };
  };
  if (data.semrush?.pending) return false;

  if (data.semrush?.lastManualCheckError) return true;

  return isOptimizingOrphanStale(input.updatedAt);
}
