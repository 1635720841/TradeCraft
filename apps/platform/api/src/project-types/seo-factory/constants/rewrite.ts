/** 手动重写 pending 超时（毫秒），超时后可重新发起 */
export const REWRITE_STALE_MS = 3 * 60 * 1000;

/** rewriteHistory 最多保留条数 */
export const REWRITE_HISTORY_MAX = 10;

export type RewriteMode = 'suggestions' | 'instruction';

export interface RewritePending {
  startedAt: string;
  mode: RewriteMode;
  instruction?: string;
}

export interface RewriteCandidate {
  content: string;
  title?: string;
  metaDescription?: string;
  changesSummary?: string[];
  warnings?: string[];
  promptVersion: string;
  generatedAt: string;
  mode: RewriteMode;
  instruction?: string;
}

export interface RewriteHistoryEntry {
  id: string;
  mode: RewriteMode;
  status: 'completed' | 'discarded' | 'accepted';
  instruction?: string;
  changesSummary?: string[];
  createdAt: string;
}

export function isRewriteStale(startedAt: string): boolean {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return Date.now() - started > REWRITE_STALE_MS;
}
