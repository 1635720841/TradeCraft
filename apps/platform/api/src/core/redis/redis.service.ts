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

  /** SERP 缓存默认 TTL 24h */
  async setSerpCache(key: string, value: string): Promise<void> {
    await this.setex(key, SERP_CACHE_TTL_SECONDS, value);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
