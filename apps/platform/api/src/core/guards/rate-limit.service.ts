/**
 * 按 organizationId 的 Redis 固定窗口限流。
 *
 * 边界：
 * - 不负责：Guard 注册（RateLimitGuard）
 *
 * 入口：
 * - RateLimitService
 */

import { Injectable } from '@nestjs/common';
import { ErrorCodes } from '../exceptions/error-codes';
import { RateLimitException } from '../exceptions/rate-limit.exception';
import { RedisService } from '../redis/redis.service';
import {
  buildOrgRateLimitKey,
  buildPublicRateLimitKey,
  isRateLimitEnabled,
  readOrgRateLimitOptions,
  readPublicRateLimitOptions,
} from './rate-limit.config';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async assertWithinOrgLimit(organizationId: string): Promise<void> {
    if (!isRateLimitEnabled()) {
      return;
    }

    const options = readOrgRateLimitOptions();
    const key = buildOrgRateLimitKey(organizationId, options.windowSec);
    const client = this.redis.getClient();
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, options.windowSec + 5);
    }

    if (count > options.maxRequests) {
      throw new RateLimitException(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        `请求过于频繁，请 ${options.windowSec} 秒后再试`,
        options.windowSec,
      );
    }
  }

  async assertWithinPublicLimit(clientIp: string): Promise<void> {
    if (!isRateLimitEnabled() || !clientIp.trim()) {
      return;
    }

    const options = readPublicRateLimitOptions();
    const key = buildPublicRateLimitKey(clientIp, options.windowSec);
    const client = this.redis.getClient();
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, options.windowSec + 5);
    }

    if (count > options.maxRequests) {
      throw new RateLimitException(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        `请求过于频繁，请 ${options.windowSec} 秒后再试`,
        options.windowSec,
      );
    }
  }
}
