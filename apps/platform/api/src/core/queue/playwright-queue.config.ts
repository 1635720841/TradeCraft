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
  const jobTimeoutMs = parsePositiveInt(process.env.PLAYWRIGHT_QUEUE_JOB_TIMEOUT_MS, 180_000);

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
