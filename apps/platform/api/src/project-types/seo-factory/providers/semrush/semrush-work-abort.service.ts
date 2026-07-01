/**
 * Semrush RPA 中止协调器（生产级三层）：
 * 1. 进程内注册表 → 立即关闭 BrowserContext
 * 2. Redis 标记 + Pub/Sub → 跨 API/Worker 实例即时通知
 * 3. DB 节流轮询 → Redis 不可用时的兜底真相源
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../../core/database/prisma.service';
import { RedisService } from '../../../../core/redis/redis.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  SEMRUSH_ABORT_DB_POLL_MS,
  SEMRUSH_ABORT_REDIS_CHANNEL,
  SEMRUSH_ABORT_REDIS_TTL_SECONDS,
  semrushAbortRedisKey,
} from './semrush-work-abort.constants';

export interface SemrushWorkAbortHandle {
  abort: () => Promise<void>;
}

@Injectable()
export class SemrushWorkAbortService implements OnModuleInit, OnModuleDestroy {
  private subscriber: Redis | null = null;
  private readonly handles = new Map<string, SemrushWorkAbortHandle>();
  private readonly dbPollCache = new Map<string, { at: number; aborted: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicateClient();
    await this.subscriber.subscribe(SEMRUSH_ABORT_REDIS_CHANNEL);
    this.subscriber.on('message', (_channel, articleJobId) => {
      const id = articleJobId?.trim();
      if (!id) return;
      void this.abortLocal(id);
    });
    this.logger.info('Semrush abort subscriber ready', {
      action: 'semrush.abort_subscriber_ready',
      channel: SEMRUSH_ABORT_REDIS_CHANNEL,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriber) return;
    await this.subscriber.unsubscribe(SEMRUSH_ABORT_REDIS_CHANNEL).catch(() => undefined);
    await this.subscriber.quit().catch(() => undefined);
    this.subscriber = null;
  }

  register(articleJobId: string, handle: SemrushWorkAbortHandle): void {
    this.handles.set(articleJobId, handle);
  }

  unregister(articleJobId: string): void {
    this.handles.delete(articleJobId);
  }

  /** 暂停/取消时调用：写 Redis + 广播 + 尝试关闭本进程浏览器 */
  async signalAbort(articleJobId: string): Promise<void> {
    await this.redis.setex(
      semrushAbortRedisKey(articleJobId),
      SEMRUSH_ABORT_REDIS_TTL_SECONDS,
      '1',
    );
    await this.redis.getClient().publish(SEMRUSH_ABORT_REDIS_CHANNEL, articleJobId);
    const local = await this.abortLocal(articleJobId);
    this.logger.info('Semrush abort signaled', {
      action: 'semrush.abort_signaled',
      articleJobId,
      localHandleHit: local,
    });
  }

  /** 恢复续跑时清除 Redis 中止标记 */
  async clearAbortSignal(articleJobId: string): Promise<void> {
    await this.redis.del(semrushAbortRedisKey(articleJobId));
    this.dbPollCache.delete(articleJobId);
  }

  /** RPA 轮询链调用：是否应中止 */
  async shouldAbort(articleJobId: string | undefined): Promise<boolean> {
    if (!articleJobId) return false;

    const redisHit = await this.redis.get(semrushAbortRedisKey(articleJobId));
    if (redisHit) {
      await this.abortLocal(articleJobId);
      return true;
    }

    return this.shouldAbortFromDbThrottled(articleJobId);
  }

  private async shouldAbortFromDbThrottled(articleJobId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.dbPollCache.get(articleJobId);
    if (cached && now - cached.at < SEMRUSH_ABORT_DB_POLL_MS) {
      return cached.aborted;
    }

    const row = await this.prisma.articleJob.findFirst({
      where: { id: articleJobId },
      select: { status: true, seoCheckData: true },
    });
    const semrush = (row?.seoCheckData as { semrush?: { cancelled?: boolean } } | null)?.semrush;
    const aborted = String(row?.status ?? '') === 'PAUSED' || semrush?.cancelled === true;
    this.dbPollCache.set(articleJobId, { at: now, aborted });
    if (aborted) {
      await this.abortLocal(articleJobId);
    }
    return aborted;
  }

  private async abortLocal(articleJobId: string): Promise<boolean> {
    const handle = this.handles.get(articleJobId);
    if (!handle) return false;
    await handle.abort().catch(() => undefined);
    return true;
  }
}
