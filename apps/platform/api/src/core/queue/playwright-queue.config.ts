/**
 * Playwright 专用队列运行参数。
 *
 * 边界：
 * - 不负责：Processor 实现
 *
 * 入口：
 * - isPlaywrightQueueEnabled / readPlaywrightQueueOptions
 */

export interface PlaywrightQueueOptions {
  concurrency: number;
  limiter: { max: number; duration: number };
  jobTimeoutMs: number;
  jobGraceMs: number;
}

export function isPlaywrightQueueEnabled(): boolean {
  return process.env.PLAYWRIGHT_QUEUE_ENABLED !== 'false';
}

export function readPlaywrightQueueOptions(): PlaywrightQueueOptions {
  const concurrency = parsePositiveInt(process.env.PLAYWRIGHT_QUEUE_CONCURRENCY, 1);
  const limitMax = parsePositiveInt(process.env.PLAYWRIGHT_QUEUE_RATE_LIMIT_MAX, 1);
  const limitDuration = parsePositiveInt(
    process.env.PLAYWRIGHT_QUEUE_RATE_LIMIT_DURATION_MS,
    60_000,
  );
  /** Semrush RPA 含导航+设词+侧栏抓取，单次最坏可超 6min；默认 10min 主等待 */
  const jobTimeoutMs = parsePositiveInt(process.env.PLAYWRIGHT_QUEUE_JOB_TIMEOUT_MS, 600_000);
  /** 主等待超时后 RPA 仍 active 时的续等宽限（不 cancel Worker） */
  const jobGraceMs = parsePositiveInt(process.env.PLAYWRIGHT_QUEUE_JOB_GRACE_MS, 180_000);

  return {
    concurrency,
    limiter: { max: limitMax, duration: limitDuration },
    jobTimeoutMs,
    jobGraceMs,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
