/**
 * 企业队列并发 Redis 计数校正（纯函数，便于单测）。
 */

/** Worker 异常退出后 Redis 计数可能高于 DB 实际占用，回落到 DB 持有数 */
export function reconcileOrgQueueActiveCount(redisActive: number, dbHeld: number): number {
  if (redisActive <= dbHeld) return redisActive;
  return dbHeld <= 0 ? 0 : dbHeld;
}
