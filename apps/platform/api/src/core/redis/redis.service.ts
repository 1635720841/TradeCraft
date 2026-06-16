/**
 * Redis 连接服务：供 SERP 缓存与 BullMQ 共享连接配置。
 *
 * 边界：
 * - 不负责：业务缓存策略（由 Provider 层处理）
 *
 * 入口：
 * - RedisService
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const SERP_CACHE_TTL_SECONDS = 86_400;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, { maxRetriesPerRequest: null });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.setex(key, ttlSeconds, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** 搜索缓存默认 TTL 24h；ttlSeconds ≤ 0 时由调用方决定不写入 */
  async setSerpCache(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? SERP_CACHE_TTL_SECONDS;
    if (ttl <= 0) return;
    await this.setex(key, ttl, value);
  }

  /** 清除项目下全部 SERP 搜索缓存 */
  async clearProjectSerpCache(organizationId: string, projectId: string): Promise<number> {
    const pattern = `serp:${organizationId}:${projectId}:*`;
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
