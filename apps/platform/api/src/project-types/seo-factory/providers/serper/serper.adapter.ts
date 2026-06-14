/**
 * Serper.dev SERP 适配器：实现 ISerpProvider，含 Redis 24h 防御性缓存。
 *
 * 边界：
 * - 不负责：业务编排（由 ScraperService / WorkflowService 处理）
 *
 * 入口：
 * - SerperAdapter
 */

import { Injectable } from '@nestjs/common';
import { buildSerpCacheKey, buildSerpFingerprint } from '@wm/shared-core';
import type { ISerpProvider, SerpQuery, SerpResult } from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { buildProxyHint, fetchWithRetry } from '../../../../core/http/http-fetch';
import { RedisService } from '../../../../core/redis/redis.service';

const SERPER_API_URL = 'https://google.serper.dev/search';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class SerperAdapter implements ISerpProvider {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async fetchSerp(query: SerpQuery): Promise<SerpResult> {
    const fingerprint = buildSerpFingerprint(query.keyword, query.locale, query.country);
    const canCache = Boolean(query.organizationId && query.projectId);

    if (canCache) {
      const cacheKey = buildSerpCacheKey(query.organizationId!, query.projectId!, fingerprint);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.info('SERP cache hit', {
          action: 'serper.cache_hit',
          fingerprint,
          organizationId: query.organizationId,
          projectId: query.projectId,
        });
        return { ...(JSON.parse(cached) as Omit<SerpResult, 'fingerprint'>), fingerprint };
      }
    }

    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, 'SERPER_API_KEY 未配置');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchWithRetry(
        SERPER_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey,
          },
          body: JSON.stringify({
            q: query.keyword,
            gl: query.country.toLowerCase(),
            hl: query.locale,
          }),
          signal: controller.signal,
        },
        { label: 'Serper' },
      );

      if (!response.ok) {
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          `Serper API 请求失败：HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as Record<string, unknown>;
      const result: SerpResult = {
        organic: (data.organic as unknown[]) ?? [],
        aiOverview: data.answerBox ?? data.knowledgeGraph,
        fingerprint,
      };

      if (canCache) {
        const cacheKey = buildSerpCacheKey(query.organizationId!, query.projectId!, fingerprint);
        await this.redis.setSerpCache(
          cacheKey,
          JSON.stringify({ organic: result.organic, aiOverview: result.aiOverview }),
        );
        this.logger.info('SERP cache miss, stored', {
          action: 'serper.cache_miss',
          fingerprint,
          organizationId: query.organizationId,
          projectId: query.projectId,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : '未知错误';
      const cause =
        error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
      const proxyHint = buildProxyHint(error);
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        `Serper API 调用失败：${message}${cause ? `（${cause}）` : ''}${proxyHint}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
