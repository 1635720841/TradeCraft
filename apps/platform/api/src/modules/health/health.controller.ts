/**
 * 健康检查 HTTP 入口。
 *
 * 边界：
 * - 不负责：业务逻辑
 *
 * 入口：
 * - HealthController
 */

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../../core/decorators/public.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import {
  ARTICLE_JOB_QUEUE,
  GSC_SYNC_QUEUE,
  PLAYWRIGHT_QUEUE,
} from '../../core/queue/queue.constants';
import {
  isPublicQueueHealthDegraded,
  summarizePublicQueueHealth,
} from '../../core/queue/public-queue-health.util';

type CheckStatus = 'ok' | 'error';

@Controller('api/v1/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(ARTICLE_JOB_QUEUE) private readonly articleQueue: Queue,
    @InjectQueue(PLAYWRIGHT_QUEUE) private readonly playwrightQueue: Queue,
    @InjectQueue(GSC_SYNC_QUEUE) private readonly gscQueue: Queue,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, redis, queues] = await Promise.all([
      this.probeDatabase(),
      this.probeRedis(),
      summarizePublicQueueHealth({
        article: this.articleQueue,
        playwright: this.playwrightQueue,
        gsc: this.gscQueue,
      }).catch(() => null),
    ]);

    const checks = {
      database,
      redis,
      ...(queues ? { queues } : {}),
    };
    const healthy = database.status === 'ok' && redis.status === 'ok';

    if (!healthy) {
      throw new ServiceUnavailableException({
        code: 'HEALTH_CHECK_FAILED',
        message: '依赖服务不可用',
        checks,
      });
    }

    const degraded = queues ? isPublicQueueHealthDegraded(queues) : false;

    return {
      data: {
        status: degraded ? 'degraded' : 'ok',
        checks,
      },
      meta: { traceId: 'health' },
    };
  }

  private async probeDatabase(): Promise<{ status: CheckStatus }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return { status: 'error' };
    }
  }

  private async probeRedis(): Promise<{ status: CheckStatus }> {
    try {
      const pong = await this.redis.getClient().ping();
      return { status: pong === 'PONG' ? 'ok' : 'error' };
    } catch {
      return { status: 'error' };
    }
  }
}
