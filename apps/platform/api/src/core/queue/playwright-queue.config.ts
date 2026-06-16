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
  /** Semrush RPA 含导航+设词+分析，最坏可超 3min；默认 6min 避免 BullMQ 先杀 worker */
  const jobTimeoutMs = parsePositiveInt(process.env.PLAYWRIGHT_QUEUE_JOB_TIMEOUT_MS, 360_000);

  return {
    concurrency,
    limiter: { max: limitMax, duration: limitDuration },
    jobTimeoutMs,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
