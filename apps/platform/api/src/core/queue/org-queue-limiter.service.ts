/**
 * 按企业限制文章任务队列并发（QUEUE-004）。
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { maxConcurrentJobsForPlan } from '../../modules/billing/plan-entitlements.constants';
import { reconcileOrgQueueActiveCount } from './org-queue-limiter.util';

/** Worker 已接管、占用并发槽位的状态（不含 QUEUED） */
const WORKER_HELD_JOB_STATUSES: JobStatus[] = [
  JobStatus.RESEARCHING,
  JobStatus.DRAFTING,
  JobStatus.LINKING,
  JobStatus.ILLUSTRATING,
  JobStatus.OPTIMIZING,
  JobStatus.REVIEWING,
];

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

@Injectable()
export class OrgQueueLimiterService {
  private readonly rateMax: number;
  private readonly rateDurationMs: number;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    this.rateMax = parsePositiveInt(process.env.ORG_QUEUE_RATE_MAX, 10);
    this.rateDurationMs = parsePositiveInt(process.env.ORG_QUEUE_RATE_DURATION_MS, 60_000);
  }

  /** 入队前校验：并发槽位 + 速率限制 */
  async assertCanEnqueue(organizationId: string): Promise<void> {
    const client = this.redis.getClient();
    const concurrentKey = `org_queue:active:${organizationId}`;
    const rateKey = `org_queue:rate:${organizationId}`;

    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { planName: true },
    });
    const maxConcurrent = maxConcurrentJobsForPlan(org?.planName ?? 'trial');

    let active = Number((await client.get(concurrentKey)) ?? 0);
    if (active >= maxConcurrent) {
      active = await this.reconcileActiveCount(organizationId, concurrentKey, active);
    }
    if (active >= maxConcurrent) {
      throw new BusinessException(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        `当前企业并行任务已达上限（${maxConcurrent}），请稍后再试`,
      );
    }

    const rateCount = await client.incr(rateKey);
    if (rateCount === 1) {
      await client.pexpire(rateKey, this.rateDurationMs);
    }
    if (rateCount > this.rateMax) {
      await client.decr(rateKey);
      throw new BusinessException(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        `入队过于频繁，请 ${Math.ceil(this.rateDurationMs / 1000)} 秒后再试`,
      );
    }
  }

  /** 入队失败时回滚速率计数 */
  async rollbackRateSlot(organizationId: string): Promise<void> {
    const rateKey = `org_queue:rate:${organizationId}`;
    const client = this.redis.getClient();
    const next = await client.decr(rateKey);
    if (next <= 0) {
      await client.del(rateKey);
    }
  }

  async onJobActive(organizationId: string): Promise<void> {
    const key = `org_queue:active:${organizationId}`;
    const client = this.redis.getClient();
    await client.incr(key);
    await client.expire(key, 3600);
  }

  async onJobFinished(organizationId: string): Promise<void> {
    const key = `org_queue:active:${organizationId}`;
    const client = this.redis.getClient();
    const next = await client.decr(key);
    if (next <= 0) {
      await client.del(key);
    }
  }

  /**
   * Worker 异常退出时 Redis 计数可能偏高；以 DB 中「已接管」任务数回落。
   */
  private async reconcileActiveCount(
    organizationId: string,
    concurrentKey: string,
    redisActive: number,
  ): Promise<number> {
    const dbHeld = await this.prisma.articleJob.count({
      where: {
        organizationId,
        status: { in: WORKER_HELD_JOB_STATUSES },
      },
    });

    if (redisActive <= dbHeld) {
      return redisActive;
    }

    const reconciled = reconcileOrgQueueActiveCount(redisActive, dbHeld);
    const client = this.redis.getClient();
    if (reconciled <= 0) {
      await client.del(concurrentKey);
      return 0;
    }

    await client.set(concurrentKey, String(reconciled), 'EX', 3600);
    return reconciled;
  }
}
