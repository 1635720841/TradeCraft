/** Redis Pub/Sub：跨实例广播 Semrush RPA 中止 */
export const SEMRUSH_ABORT_REDIS_CHANNEL = 'seo-factory:semrush-abort';

/** Redis 中止标记（暂停时写入，恢复时清除） */
export const semrushAbortRedisKey = (articleJobId: string): string =>
  `semrush:abort:${articleJobId}`;

export const SEMRUSH_ABORT_REDIS_TTL_SECONDS = 86_400;

/** DB 轮询节流：RPA 循环内兜底查库间隔 */
export const SEMRUSH_ABORT_DB_POLL_MS = 2_000;
