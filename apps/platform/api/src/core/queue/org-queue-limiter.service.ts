/**
 * 按企业限制文章任务队列并发（QUEUE-004）。
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { maxConcurrentJobsForPlan } from '../../modules/billing/plan-entitlements.constants';

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

    const active = Number((await client.get(concurrentKey)) ?? 0);
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
}
